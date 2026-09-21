import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import type { SiteDescriptor } from "./site.ts";

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;
// Only verified WorkBuddy wire facts belong here; generic OpenAI compatibility stays host-owned.
const COMPAT = {
  supportsReasoningEffort: true,
  maxTokensField: "max_tokens" as const,
};
const EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];
export type ModelScope = "free" | "all";

export interface ProductModel {
  id: string;
  name: string;
  credits?: string;
  contextWindow: number;
  maxTokens: number;
  supportsImages: boolean;
  supportsReasoning: boolean;
  supportedEfforts?: Effort[];
  canDisableThinking?: boolean;
  defaultEffort?: Effort;
}

export interface ModelDiagnostic {
  index: number;
  id?: string;
  code:
    | "invalid-structure"
    | "missing-id"
    | "invalid-context-window"
    | "invalid-max-tokens"
    | "invalid-default-effort"
    | "duplicate-id";
  message: string;
}

export type ProductConfigSource = "desktop-cache" | "builtin-fallback";
export type ProductConfigFallbackReason =
  | "missing"
  | "unreadable"
  | "invalid-json"
  | "invalid-schema"
  | "no-valid-models";

export interface ProductConfig {
  source: ProductConfigSource;
  models: ProductModel[];
  diagnostics: ModelDiagnostic[];
  fallbackReason?: ProductConfigFallbackReason;
}


function productConfigPath(site: SiteDescriptor): string {
  const override = process.env[site.catalog.env]?.trim();
  if (override) return override;
  return join(homedir(), ...site.catalog.pathSegments);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Product credits are multiplier strings; every canonical numeric zero spelling is explicit free evidence. */
export function creditsAreFree(credits: string | undefined): boolean {
  if (credits === undefined) return false;
  return /^x?0(?:\.0+)?$/u.test(credits.trim());
}

function isEffort(value: unknown): value is Effort {
  return typeof value === "string" && (EFFORTS as readonly string[]).includes(value);
}

function parseEfforts(value: unknown): Effort[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const declared = new Set(value.filter(isEffort));
  const efforts = EFFORTS.filter((effort) => declared.has(effort));
  return efforts.length > 0 ? [...efforts] : undefined;
}

function parseProductModel(
  value: unknown,
  index: number,
): { model?: ProductModel; diagnostics: ModelDiagnostic[] } {
  const row = asRecord(value);
  if (!row) {
    return {
      diagnostics: [{ index, code: "invalid-structure", message: `models[${index}] must be an object` }],
    };
  }

  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (id === "") {
    return {
      diagnostics: [{ index, code: "missing-id", message: `models[${index}] has no usable id` }],
    };
  }

  const contextWindow = positiveInteger(row.maxInputTokens) ?? positiveInteger(row.maxAllowedSize);
  const maxTokens = positiveInteger(row.maxOutputTokens);
  const diagnostics: ModelDiagnostic[] = [];
  if (contextWindow === undefined) {
    diagnostics.push({ index, id, code: "invalid-context-window", message: `${id} has no positive integer input budget` });
  }
  if (maxTokens === undefined) {
    diagnostics.push({ index, id, code: "invalid-max-tokens", message: `${id} has no positive integer output budget` });
  }
  if (contextWindow === undefined || maxTokens === undefined) return { diagnostics };

  const reasoning = asRecord(row.reasoning);
  const supportedEfforts = parseEfforts(reasoning?.supportedEfforts);
  const canDisableThinking = typeof reasoning?.canDisableThinking === "boolean"
    ? reasoning.canDisableThinking
    : undefined;
  let defaultEffort: Effort | undefined;
  if (reasoning && "defaultEffort" in reasoning) {
    const declaredDefault = reasoning.defaultEffort;
    if (isEffort(declaredDefault) && supportedEfforts?.includes(declaredDefault)) {
      defaultEffort = declaredDefault;
    } else {
      diagnostics.push({
        index,
        id,
        code: "invalid-default-effort",
        message: `${id} has a default reasoning effort outside its supported efforts`,
      });
    }
  }
  return {
    model: {
      id,
      name: typeof row.name === "string" && row.name.trim() !== "" ? row.name.trim() : id,
      ...(typeof row.credits === "string" && row.credits.trim() !== "" ? { credits: row.credits.trim() } : {}),
      contextWindow,
      maxTokens,
      supportsImages: row.supportsImages === true && row.disabledMultimodal !== true,
      supportsReasoning: row.supportsReasoning === true,
      ...(supportedEfforts ? { supportedEfforts } : {}),
      ...(canDisableThinking === undefined ? {} : { canDisableThinking }),
      ...(defaultEffort ? { defaultEffort } : {}),
    },
    diagnostics,
  };
}

type ParsedProductDocument =
  | { config: ProductConfig; declaredModelCount: number }
  | { fallbackReason: "invalid-json" | "invalid-schema" };

function parseProductDocument(text: string): ParsedProductDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { fallbackReason: "invalid-json" };
  }
  const document = asRecord(parsed);
  if (!document || !Array.isArray(document.models)) return { fallbackReason: "invalid-schema" };

  const models: ProductModel[] = [];
  const diagnostics: ModelDiagnostic[] = [];
  const ids = new Set<string>();
  for (const [index, value] of document.models.entries()) {
    const result = parseProductModel(value, index);
    diagnostics.push(...result.diagnostics);
    if (!result.model) continue;
    if (ids.has(result.model.id)) {
      diagnostics.push({
        index,
        id: result.model.id,
        code: "duplicate-id",
        message: `${result.model.id} is duplicated in the product catalog`,
      });
      continue;
    }
    ids.add(result.model.id);
    models.push(result.model);
  }
  return {
    config: { source: "desktop-cache", models, diagnostics },
    declaredModelCount: document.models.length,
  };
}

export function parseProductConfig(text: string): ProductConfig | undefined {
  const result = parseProductDocument(text);
  return "config" in result ? result.config : undefined;
}

function builtinFallback(
  site: SiteDescriptor,
  fallbackReason: ProductConfigFallbackReason,
  diagnostics: ModelDiagnostic[] = [],
): ProductConfig {
  return { source: "builtin-fallback", fallbackReason, models: [...site.catalog.builtin], diagnostics };
}

export function loadProductConfig(site: SiteDescriptor, path = productConfigPath(site)): ProductConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
    return builtinFallback(site, code === "ENOENT" ? "missing" : "unreadable");
  }

  const parsed = parseProductDocument(text);
  if ("fallbackReason" in parsed) return builtinFallback(site, parsed.fallbackReason);
  if (parsed.declaredModelCount > 0 && parsed.config.models.length === 0) {
    return builtinFallback(site, "no-valid-models", parsed.config.diagnostics);
  }
  return parsed.config;
}

export function freeModelIds(config: ProductConfig): readonly string[] {
  if (config.source !== "desktop-cache") return [];
  return config.models.filter((model) => creditsAreFree(model.credits)).map((model) => model.id);
}

export function modelMaxTokens(site: SiteDescriptor, modelId: string, maxTokens: number): number {
  const override = site.modelOverrides[modelId]?.maxTokens;
  return override === undefined ? maxTokens : Math.min(maxTokens, override);
}

export function buildOmpModels(site: SiteDescriptor, config: ProductConfig, scope: ModelScope): ProviderModelConfig[] {
  const free = new Set(freeModelIds(config));
  return config.models
    .filter((model) => scope === "all" || free.has(model.id))
    .map((model): ProviderModelConfig => {
      const hasCanonicalThinking = model.supportsReasoning
        && model.supportedEfforts !== undefined
        && model.canDisableThinking !== undefined;
      type OmpThinking = NonNullable<ProviderModelConfig["thinking"]>;
      // Product canonical effort strings are the runtime values of OMP's Effort enum.
      const thinkingEfforts = model.supportedEfforts as OmpThinking["efforts"];
      const defaultLevel = model.defaultEffort as OmpThinking["defaultLevel"];
      return {
        id: model.id,
        name: `${model.name} · ${model.credits ?? "x?"}`,
        reasoning: model.supportsReasoning,
        ...(hasCanonicalThinking
          ? {
              thinking: {
                mode: "effort",
                efforts: thinkingEfforts,
                requiresEffort: !model.canDisableThinking,
                ...(defaultLevel ? { defaultLevel } : {}),
              },
            }
          : {}),
        input: model.supportsImages ? ["text", "image"] : ["text"],
        cost: ZERO_COST,
        contextWindow: model.contextWindow,
        maxTokens: modelMaxTokens(site, model.id, model.maxTokens),
        compat: {
          ...COMPAT,
          ...(model.supportsImages ? { stripImageInput: false } : {}),
        },
      };
    });
}
