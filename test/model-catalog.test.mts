import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildOmpModels,
  creditsAreFree,
  freeModelIds,
  loadProductConfig,
  modelMaxTokens,
  parseProductConfig,
} from "../src/models.ts";
import { WORKBUDDY_INTL, type SiteDescriptor } from "../src/site.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const catalog = parseProductConfig(JSON.stringify({
  models: [
    {
      id: "free-required",
      name: "Free Required",
      credits: "x0.00",
      maxInputTokens: 200_000,
      maxOutputTokens: 20_000,
      supportsImages: true,
      supportsReasoning: true,
      reasoning: {
        supportedEfforts: ["max", "invalid", "minimal", "high", "minimal"],
        canDisableThinking: false,
        defaultEffort: "high",
      },
    },
    {
      id: "paid-optional",
      credits: "x1.25",
      maxInputTokens: 100_000,
      maxOutputTokens: 8_000,
      supportsReasoning: true,
      reasoning: { supportedEfforts: ["max", "low"], canDisableThinking: true, defaultEffort: "medium" },
    },
    {
      id: "unknown-reasoning",
      maxInputTokens: 80_000,
      maxOutputTokens: 4_000,
      supportsReasoning: true,
    },
    null,
    { id: "", maxInputTokens: 1, maxOutputTokens: 1 },
    { id: "bad-context", maxInputTokens: 0, maxOutputTokens: 1 },
    { id: "bad-output", maxInputTokens: 1, maxOutputTokens: 1.5 },
    { id: "free-required", maxInputTokens: 1, maxOutputTokens: 1 },
  ],
}));
const invalidOnly = parseProductConfig(JSON.stringify({
  models: [{ maxInputTokens: 1, maxOutputTokens: 1 }, { id: "bad-budget", maxInputTokens: -1, maxOutputTokens: 0 }],
}));
assert(invalidOnly, "invalid-only catalog lost its diagnostics");
assert(invalidOnly.models.length === 0, "invalid-only catalog registered a model");
assert(invalidOnly.diagnostics.length === 3, `invalid-only diagnostics missing: ${JSON.stringify(invalidOnly.diagnostics)}`);

assert(catalog, "mixed product catalog was rejected");
assert(catalog.models.length === 3, `invalid catalog rows were registered: ${catalog.models.length}`);
assert(
  catalog.diagnostics.map((diagnostic) => diagnostic.code).join(",")
    === "invalid-default-effort,invalid-structure,missing-id,invalid-context-window,invalid-max-tokens,duplicate-id",
  `invalid row diagnostics were incomplete: ${JSON.stringify(catalog.diagnostics)}`,
);

const all = buildOmpModels(WORKBUDDY_INTL, catalog, "all");
assert(all.length === 3, "all scope did not preserve the valid cache catalog");
const required = all.find((model) => model.id === "free-required");
assert(required, "free reasoning model disappeared");
assert(required.thinking?.mode === "effort", "canonical effort metadata missing");
assert(
  required.thinking.efforts.join(",") === "minimal,high,max",
  `unsupported or unordered efforts leaked: ${required.thinking.efforts.join(",")}`,
);
assert(required.thinking.requiresEffort === true, "non-disableable reasoning exposed off");
assert(required.thinking.defaultLevel === "high", "valid product default effort was not preserved");
assert(required.input.join(",") === "text,image", "vision capability was not emitted");
assert(required.compat?.stripImageInput === false, "host vision stripping was not disabled");

const optional = all.find((model) => model.id === "paid-optional");
assert(optional?.thinking?.requiresEffort === false, "optional reasoning did not expose off");
assert(optional.thinking.efforts.join(",") === "low,max", "optional model exposed unsupported efforts");
assert(optional.thinking.defaultLevel === undefined, "unsupported product default effort leaked into OMP metadata");
const unknownReasoning = all.find((model) => model.id === "unknown-reasoning");
assert(unknownReasoning?.reasoning === true, "reasoning capability was dropped");
assert(unknownReasoning.thinking === undefined, "missing effort evidence defaulted to every effort");
assert(required.name === "Free Required · x0.00", `declared multiplier was not shown: ${required.name}`);
assert(optional?.name === "paid-optional · x1.25", `unnamed model lost its multiplier: ${optional?.name}`);
assert(unknownReasoning?.name === "unknown-reasoning", `unknown multiplier leaked a placeholder: ${unknownReasoning?.name}`);

assert(creditsAreFree("x0.00") && creditsAreFree("0.0"), "explicit zero-credit evidence was rejected");
assert(!creditsAreFree(undefined) && !creditsAreFree("x1.00"), "unknown or paid credits were treated as free");
assert(freeModelIds(catalog).join(",") === "free-required", "free IDs did not use explicit cache evidence");
assert(buildOmpModels(WORKBUDDY_INTL, catalog, "free").map((model) => model.id).join(",") === "free-required", "free scope leaked paid or unknown models");
assert(unknownReasoning.cost.input === 0, "host cost placeholder changed");
assert(!buildOmpModels(WORKBUDDY_INTL, catalog, "free").some((model) => model.id === unknownReasoning.id), "zero cost placeholder became free evidence");

const paidAndUnknown = parseProductConfig(JSON.stringify({
  models: [
    { id: "paid", credits: "x2.00", maxInputTokens: 10, maxOutputTokens: 5 },
    { id: "unknown", maxInputTokens: 10, maxOutputTokens: 5 },
  ],
}));
assert(paidAndUnknown, "paid/unknown catalog was rejected");
assert(buildOmpModels(WORKBUDDY_INTL, paidAndUnknown, "free").length === 0, "empty free catalog was widened with fallbacks");
assert(buildOmpModels(WORKBUDDY_INTL, paidAndUnknown, "all").length === 2, "all scope did not mean the current cache catalog");

const multiplierEvidence = parseProductConfig(JSON.stringify({
  models: [
    { id: "zero", name: "Zero", credits: "x0", maxInputTokens: 10, maxOutputTokens: 5 },
    { id: "one", name: "One", credits: "x1", maxInputTokens: 10, maxOutputTokens: 5 },
    { id: "unknown-multiplier", name: "Unknown", maxInputTokens: 10, maxOutputTokens: 5 },
    { id: "blank-multiplier", name: "Blank", credits: "   ", maxInputTokens: 10, maxOutputTokens: 5 },
  ],
}));
assert(multiplierEvidence, "multiplier evidence catalog was rejected");
const namedModels = buildOmpModels(WORKBUDDY_INTL, multiplierEvidence, "all");
assert(
  namedModels.map((model) => model.name).join("|") === "Zero · x0|One · x1|Unknown|Blank",
  `model names did not follow multiplier evidence: ${namedModels.map((model) => model.name).join("|")}`,
);

const temp = await mkdtemp(join(tmpdir(), "workbuddy-model-catalog-"));
try {
  const missing = loadProductConfig(WORKBUDDY_INTL, join(temp, "missing.json"));
  assert(missing.source === "builtin-fallback", "missing cache did not select builtin fallback");
  assert(missing.fallbackReason === "missing", "missing cache reason was lost");
  assert(buildOmpModels(WORKBUDDY_INTL, missing, "free").length === 0, "builtin zero cost or stale credits claimed free status");
  const fallbackModels = buildOmpModels(WORKBUDDY_INTL, missing, "all");
  assert(fallbackModels.length === 3, "builtin fallback catalog was unavailable in all scope");
  assert(
    fallbackModels.map((model) => model.name).join("|") === "Deepseek-V4.1-Flash|Hy4 preview|Hy3",
    `fallback models displayed an unproven multiplier: ${fallbackModels.map((model) => model.name).join("|")}`,
  );

  const unreadablePath = join(temp, "cache-directory");
  await mkdir(unreadablePath);
  const unreadable = loadProductConfig(WORKBUDDY_INTL, unreadablePath);
  assert(unreadable.source === "builtin-fallback" && unreadable.fallbackReason === "unreadable", "unreadable cache reason was lost");

  const invalidJsonPath = join(temp, "invalid-json.json");
  await writeFile(invalidJsonPath, "{");
  const invalidJson = loadProductConfig(WORKBUDDY_INTL, invalidJsonPath);
  assert(invalidJson.source === "builtin-fallback" && invalidJson.fallbackReason === "invalid-json", "invalid JSON cache reason was lost");

  const invalidSchemaPath = join(temp, "invalid-schema.json");
  await writeFile(invalidSchemaPath, JSON.stringify({ models: "not-an-array" }));
  const invalidSchema = loadProductConfig(WORKBUDDY_INTL, invalidSchemaPath);
  assert(invalidSchema.source === "builtin-fallback" && invalidSchema.fallbackReason === "invalid-schema", "invalid schema cache reason was lost");

  const noValidModelsPath = join(temp, "no-valid-models.json");
  await writeFile(noValidModelsPath, JSON.stringify({ models: [null, { id: "" }] }));
  const noValidModels = loadProductConfig(WORKBUDDY_INTL, noValidModelsPath);
  assert(
    noValidModels.source === "builtin-fallback" && noValidModels.fallbackReason === "no-valid-models",
    "non-empty cache without a valid model did not use its explicit fallback reason",
  );
  assert(noValidModels.diagnostics.length > 0, "invalid cache row diagnostics were discarded");

  const emptyPath = join(temp, "empty.json");
  await writeFile(emptyPath, JSON.stringify({ models: [] }));
  const empty = loadProductConfig(WORKBUDDY_INTL, emptyPath);
  assert(empty.source === "desktop-cache", "valid empty cache was mislabeled as fallback");
  assert(empty.fallbackReason === undefined, "valid empty cache acquired a fallback reason");
  assert(buildOmpModels(WORKBUDDY_INTL, empty, "all").length === 0, "valid empty cache was widened with builtin models");
} finally {
  await rm(temp, { recursive: true, force: true });
}

assert(modelMaxTokens(WORKBUDDY_INTL, "deepseek-v4.1-flash", 128_000) === 16_384, "catalog cap was not enforced");
assert(modelMaxTokens(WORKBUDDY_INTL, "deepseek-v4.1-flash", 1_024) === 1_024, "small valid budget was raised");
assert(modelMaxTokens(WORKBUDDY_INTL, "other", 128_000) === 128_000, "unrelated model budget was clamped");
const unoverriddenRealm: SiteDescriptor = {
  ...WORKBUDDY_INTL,
  providerId: "workbuddy-cn",
  modelOverrides: Object.freeze({}),
};
assert(
  modelMaxTokens(unoverriddenRealm, "deepseek-v4.1-flash", 128_000) === 128_000,
  "international model override leaked into another realm",
);

console.log("OK: model parsing, thinking, vision, budgets, truthful free scope, and multiplier display");
