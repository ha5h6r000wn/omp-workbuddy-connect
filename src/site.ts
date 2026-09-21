import type { ProductModel } from "./models.ts";

export type DomainPolicy =
  | { readonly kind: "fixed"; readonly value: string }
  | { readonly kind: "jwt-issuer"; readonly responseField: "domain" };

export interface ModelOverride {
  readonly maxTokens?: number;
}

export interface SiteDescriptor {
  readonly providerId: string;
  readonly displayName: string;
  readonly label: string;
  readonly commandName: string;
  readonly apiOrigin: string;
  readonly chatPath: string;
  readonly auth: {
    readonly platform: string;
    readonly startPath: string;
    readonly tokenPath: string;
    readonly accountPath?: string;
    readonly refreshPath: string;
    readonly refreshBody: "none" | "empty-json";
    readonly nonceMode: "none" | "query-and-body";
    readonly pollIntervalMs: number;
    readonly pollDeadlineMs: number;
    readonly pendingCode: number;
    readonly refreshSource: string;
    readonly allowedLoginOrigins: readonly string[];
    readonly headers: Readonly<Record<string, string>>;
    readonly finalizeIdentity: "token-response" | "account-endpoint";
  };
  readonly protocolHeaders: Readonly<Record<string, string>>;
  readonly domainPolicy: DomainPolicy;
  readonly catalog: {
    readonly env: string;
    readonly pathSegments: readonly string[];
    readonly builtin: readonly ProductModel[];
  };
  readonly modelOverrides: Readonly<Record<string, ModelOverride>>;
  readonly payload: {
    readonly normalizeNamedToolChoice: boolean;
  };
  readonly settingsFile: string;
  readonly widgetKey: string;
  readonly uiTitle: string;
  readonly usage: {
    readonly enabled: boolean;
    readonly billingPath: string;
    readonly source: string;
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

const origin = "https://www.workbuddy.ai";
const userAgent = "CLI/2.63.2 CodeBuddy/2.63.2";
const protocolHeaders = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  Origin: origin,
  Referer: `${origin}/`,
  "User-Agent": userAgent,
  "X-Requested-With": "XMLHttpRequest",
  "X-Product": "SaaS",
};

export const WORKBUDDY_INTL: SiteDescriptor = deepFreeze({
  providerId: "workbuddy",
  displayName: "WorkBuddy AI",
  label: "WorkBuddy",
  commandName: "workbuddy",
  apiOrigin: origin,
  chatPath: "/v2/chat/completions",
  auth: {
    platform: "CLI",
    startPath: "/v2/plugin/auth/state",
    tokenPath: "/v2/plugin/auth/token",
    refreshPath: "/v2/plugin/auth/token/refresh",
    refreshBody: "none",
    nonceMode: "query-and-body",
    pollIntervalMs: 2_000,
    pollDeadlineMs: 15 * 60 * 1000,
    pendingCode: 11217,
    refreshSource: "workbuddy",
    allowedLoginOrigins: [origin],
    headers: {
      ...protocolHeaders,
      "X-No-Authorization": "true",
      "X-No-User-Id": "1",
      "X-No-Enterprise-Id": "1",
      "X-No-Department-Info": "1",
    },
    finalizeIdentity: "token-response",
  },
  protocolHeaders,
  domainPolicy: { kind: "fixed", value: "www.workbuddy.ai" },
  catalog: {
    env: "WORKBUDDYAI_PRODUCT_CONFIG",
    pathSegments: [".workbuddy-ai", "cache", "acc-product-config-v3.json"],
    builtin: [
      {
        id: "deepseek-v4.1-flash",
        name: "Deepseek-V4.1-Flash",
        freeEvidence: "unknown",
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        supportsImages: true,
        supportsReasoning: true,
        supportedEfforts: ["low", "medium", "high", "xhigh", "max"],
        canDisableThinking: false,
      },
      {
        id: "hy4-preview-f",
        name: "Hy4 preview",
        contextWindow: 1_000_000,
        freeEvidence: "unknown",
        maxTokens: 64_000,
        supportsImages: true,
        supportsReasoning: true,
        supportedEfforts: ["high"],
        canDisableThinking: false,
      },
      {
        id: "hy3",
        name: "Hy3",
        contextWindow: 192_000,
        maxTokens: 64_000,
        freeEvidence: "unknown",
        supportsImages: true,
        supportsReasoning: true,
        supportedEfforts: ["low", "high"],
        canDisableThinking: false,
      },
    ],
  },
  modelOverrides: {
    "deepseek-v4.1-flash": { maxTokens: 16_384 },
  },
  payload: {
    normalizeNamedToolChoice: true,
  },
  settingsFile: ".workbuddy-settings.json",
  widgetKey: "workbuddy",
  uiTitle: "WorkBuddy AI · 国际版",
  usage: {
    enabled: true,
    billingPath: "/v2/billing/meter/get-user-resource",
    source: "workbuddy-billing",
  },
});

const cnOrigin = "https://copilot.tencent.com";
const cnProtocolHeaders = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
  "X-Product": "SaaS",
};
/**
 * CN protocol descriptor approved for production assembly by the redacted M2
 * account-finalize, issuer-domain restart, and official OMP outbound evidence.
 */
export const WORKBUDDY_CN: SiteDescriptor = deepFreeze({
  providerId: "workbuddy-cn",
  displayName: "WorkBuddy 中国站",
  label: "WorkBuddy 中国站",
  commandName: "workbuddy-cn",
  apiOrigin: cnOrigin,
  chatPath: "/v2/chat/completions",
  auth: {
    platform: "workbuddy",
    startPath: "/v2/plugin/auth/state",
    tokenPath: "/v2/plugin/auth/token",
    accountPath: "/v2/plugin/account",
    refreshPath: "/v2/plugin/auth/token/refresh",
    refreshBody: "empty-json",
    nonceMode: "none",
    pollIntervalMs: 1_000,
    pollDeadlineMs: 5 * 60 * 1000,
    pendingCode: 11217,
    refreshSource: "plugin",
    allowedLoginOrigins: [cnOrigin, "https://www.workbuddy.cn"],
    headers: {
      ...cnProtocolHeaders,
      "X-No-Authorization": "true",
      "X-No-User-Id": "true",
      "X-No-Enterprise-Id": "true",
      "X-No-Department-Info": "true",
    },
    finalizeIdentity: "account-endpoint",
  },
  protocolHeaders: cnProtocolHeaders,
  domainPolicy: { kind: "jwt-issuer", responseField: "domain" },
  catalog: {
    env: "WORKBUDDY_CN_PRODUCT_CONFIG",
    pathSegments: [".workbuddy", "cache", "acc-product-config-v3.json"],
    builtin: [],
  },
  modelOverrides: {},
  payload: {
    normalizeNamedToolChoice: false,
  },
  settingsFile: ".workbuddy-cn-settings.json",
  widgetKey: "workbuddy-cn",
  uiTitle: "WorkBuddy · 中国站",
  usage: {
    enabled: false,
    billingPath: "",
    source: "unavailable",
  },
});

export function siteUrl(site: SiteDescriptor, path: string): string {
  return new URL(path, site.apiOrigin).toString();
}

export function chatBaseUrl(site: SiteDescriptor): string {
  const suffix = "/chat/completions";
  if (!site.chatPath.endsWith(suffix)) throw new Error(`${site.providerId} chatPath must end with ${suffix}`);
  return siteUrl(site, site.chatPath.slice(0, -suffix.length));
}

export function chatHeaders(site: SiteDescriptor): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  for (const name of ["Accept", "Origin", "Referer", "User-Agent", "X-Requested-With", "X-Product"]) {
    const value = site.protocolHeaders[name];
    if (value) headers[name] = value;
  }
  if (site.domainPolicy.kind === "fixed") headers["X-Domain"] = site.domainPolicy.value;
  return headers;
}
