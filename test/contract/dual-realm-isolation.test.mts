import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@oh-my-pi/pi-ai";
import type { ModelRegistry as ModelRegistryType } from "@oh-my-pi/pi-coding-agent/config/model-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jwt(issuer: string): string {
  return `x.${Buffer.from(JSON.stringify({ iss: issuer })).toString("base64url")}.y`;
}

const temp = await mkdtemp(join(tmpdir(), "workbuddy-dual-realm-"));
const intlCatalogPath = join(temp, "intl-catalog.json");
const cnCatalogPath = join(temp, "cn-catalog.json");
const desktopCredentialPath = join(temp, "desktop-owned-credential.json");
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousIntlCatalog = process.env.WORKBUDDYAI_PRODUCT_CONFIG;
const previousCnCatalog = process.env.WORKBUDDY_CN_PRODUCT_CONFIG;
const previousFetch = globalThis.fetch;

const sharedModels = [
  {
    id: "hy3",
    name: "Hy3",
    credits: "x0.00",
    maxInputTokens: 192_000,
    maxOutputTokens: 64_000,
    supportsImages: true,
    supportsReasoning: true,
    reasoning: { supportedEfforts: ["low", "high"], canDisableThinking: false },
  },
  {
    id: "deepseek-v4.1-flash",
    name: "Deepseek V4.1 Flash",
    credits: "x1.00",
    maxInputTokens: 1_000_000,
    maxOutputTokens: 128_000,
    supportsImages: true,
    supportsReasoning: true,
    reasoning: { supportedEfforts: ["high"], canDisableThinking: false },
  },
];
await writeFile(intlCatalogPath, JSON.stringify({ models: sharedModels }));
await writeFile(cnCatalogPath, JSON.stringify({ models: sharedModels }));
await writeFile(desktopCredentialPath, "desktop-owned\n");
const desktopBefore = await readFile(desktopCredentialPath, "utf8");
process.env.PI_CODING_AGENT_DIR = temp;
process.env.WORKBUDDYAI_PRODUCT_CONFIG = intlCatalogPath;
process.env.WORKBUDDY_CN_PRODUCT_CONFIG = cnCatalogPath;

const { refreshDirsFromEnv } = await import("@oh-my-pi/pi-utils");
refreshDirsFromEnv();
const { AuthStorage } = await import("@oh-my-pi/pi-ai");
const { unregisterOAuthProvider } = await import("@oh-my-pi/pi-ai/registry/oauth");
const { ModelRegistry } = await import("@oh-my-pi/pi-coding-agent/config/model-registry");
let billingCalls = 0;
const usageFetch: typeof fetch = async (input) => {
  const url = String(input);
  assert(
    url === "https://www.workbuddy.ai/v2/billing/meter/get-user-resource",
    `management UI crossed realm endpoint: ${url}`,
  );
  billingCalls += 1;
  return Response.json({ code: 0, data: { Response: { Data: { Accounts: [] } } } });
};
const authStorage = await AuthStorage.create(join(temp, "auth.db"), { usageFetch });
const registry = new ModelRegistry(authStorage, join(temp, "models.yml"), {
  cacheDbPath: join(temp, "models.db"),
});
const expires = Date.now() + 60 * 60 * 1000;
await authStorage.credentials.set("workbuddy", {
  type: "oauth",
  access: "intl-access",
  refresh: "intl-refresh",
  expires,
  accountId: "intl-account",
  orgId: "intl-org",
});
await authStorage.credentials.set("workbuddy-cn", {
  type: "oauth",
  access: jwt("https://copilot.tencent.com"),
  refresh: "cn-refresh",
  expires,
  accountId: "cn-account",
});


const handlers: Record<string, Function[]> = {};
const commands = new Map<string, (args: unknown, ctx: any) => Promise<void>>();
const configs = new Map<string, any>();
const pi: any = {
  on(name: string, handler: Function) {
    (handlers[name] ??= []).push(handler);
  },
  registerProvider(name: string, config: Parameters<ModelRegistryType["registerProvider"]>[1]) {
    configs.set(name, config);
    registry.registerProvider(name, config);
  },
  unregisterProvider(name: string) {
    configs.delete(name);
    registry.unregisterProvider(name);
  },
  registerCommand(name: string, definition: { handler(args: unknown, ctx: any): Promise<void> }) {
    commands.set(name, definition.handler);
  },
};
const widgets = new Map<string, string[] | undefined>();
const ctx: any = {
  hasUI: true,
  model: undefined,
  modelRegistry: registry,
  sessionManager: { getSessionId: () => "dual-realm-contract" },
  ui: {
    setWidget(key: string, content: string[] | undefined) { widgets.set(key, content); },
    setStatus() {},
    notify() {},
    async select() { return undefined; },
  },
};

try {
  const extension = await import("../../extensions/workbuddy.ts");
  await extension.default(pi);
  assert(commands.has("workbuddy") && commands.has("workbuddy-cn"), "realm commands were not registered independently");
  assert(configs.has("workbuddy") && configs.has("workbuddy-cn"), "realm providers were not registered independently");
  const intlConfig = configs.get("workbuddy");
  const cnConfig = configs.get("workbuddy-cn");
  assert(
    intlConfig.headers?.Origin === "https://www.workbuddy.ai"
      && intlConfig.headers?.Referer === "https://www.workbuddy.ai/"
      && intlConfig.headers?.["X-Domain"] === "www.workbuddy.ai",
    "international static protocol headers changed",
  );
  assert(
    cnConfig.headers?.Origin === undefined
      && cnConfig.headers?.Referer === undefined
      && cnConfig.headers?.["X-Domain"] === undefined,
    "CN static provider config copied international protocol headers",
  );
  for (const start of handlers.session_start ?? []) await start({}, ctx);

  await commands.get("workbuddy")!("all", ctx);
  await commands.get("workbuddy-cn")!("all", ctx);
  assert(
    JSON.parse(await readFile(join(temp, ".workbuddy-settings.json"), "utf8")).scope === "all"
      && JSON.parse(await readFile(join(temp, ".workbuddy-cn-settings.json"), "utf8")).scope === "all",
    "realm scopes did not persist independently",
  );

  const intl = registry.find("workbuddy", "deepseek-v4.1-flash") as Model | undefined;
  const cn = registry.find("workbuddy-cn", "deepseek-v4.1-flash") as Model | undefined;
  assert(intl && cn, "same-ID models did not coexist across realms");
  assert(intl.baseUrl === "https://www.workbuddy.ai/v2", `international endpoint changed: ${intl.baseUrl}`);
  assert(cn.baseUrl === "https://copilot.tencent.com/v2", `CN endpoint changed: ${cn.baseUrl}`);
  assert(intl.maxTokens === 16_384, `international token clamp missing: ${intl.maxTokens}`);
  assert(cn.maxTokens === 128_000, `international token clamp leaked into CN: ${cn.maxTokens}`);
  const intlHeaders = await intl.resolveHeaders?.();
  const cnHeaders = await cn.resolveHeaders?.();
  assert(
    intlHeaders?.["X-User-Id"] === "intl-account"
      && intlHeaders["X-Enterprise-Id"] === "intl-org",
    "international dynamic identity headers crossed realms",
  );
  assert(
    cnHeaders?.["X-User-Id"] === "cn-account"
      && cnHeaders["X-No-Enterprise-Id"] === "1"
      && cnHeaders["X-Domain"] === "copilot.tencent.com",
    "CN dynamic identity or credential-derived domain headers crossed realms",
  );

  const hook = handlers.before_provider_request?.[0];
  assert(hook, "request-bound provider hook was not registered");
  const namedChoice = {
    model: "deepseek-v4.1-flash",
    messages: [{ role: "user", content: "contract" }],
    tool_choice: { type: "function", function: { name: "read" } },
  };
  const intlPayload = hook({ payload: namedChoice }, { model: intl });
  assert(intlPayload?.tool_choice === "read", "international named-tool policy was not applied");
  assert(hook({ payload: namedChoice }, { model: cn }) === undefined, "international payload policy leaked into CN");
  assert(
    hook({ payload: namedChoice }, { model: { provider: "foreign", id: cn.id } }) === undefined,
    "same-ID foreign provider was rewritten",
  );

  await commands.get("workbuddy-cn")!("", { ...ctx, model: cn });
  assert(billingCalls === 0, "CN management UI invoked aggregate Usage or Billing");
  assert(
    widgets.get("workbuddy-cn")?.some((line) => line === "积分  不可用"),
    "CN management UI did not expose disabled Usage",
  );
  await commands.get("workbuddy")!("", { ...ctx, model: intl });
  assert(billingCalls === 1, `international UI did not make exactly one Billing call: ${billingCalls}`);

  await commands.get("workbuddy-cn")!("logout", { ...ctx, model: cn });
  assert(authStorage.oauth.accounts("workbuddy-cn").length === 0, "CN logout retained its credential row");
  assert(authStorage.oauth.accounts("workbuddy").length === 1, "CN logout removed the international credential row");
  let retainedCnRejected = false;
  try {
    await cn.resolveHeaders?.();
  } catch {
    retainedCnRejected = true;
  }
  assert(retainedCnRejected, "retained CN model remained usable after scoped logout");
  assert((await intl.resolveHeaders?.())?.["X-User-Id"] === "intl-account", "CN logout invalidated international transport");

  for (const shutdown of handlers.session_shutdown ?? []) await shutdown({}, ctx);
  let shutdownIntlRejected = false;
  try {
    await intl.resolveHeaders?.();
  } catch {
    shutdownIntlRejected = true;
  }
  assert(shutdownIntlRejected, "extension shutdown left a retained transport usable");
  assert(await readFile(desktopCredentialPath, "utf8") === desktopBefore, "realm lifecycle modified Desktop-owned data");

  console.log("OK: dual realms isolate auth, endpoint, payload, budgets, scope, Usage, UI, logout, shutdown, and retained models");
} finally {
  unregisterOAuthProvider("workbuddy");
  unregisterOAuthProvider("workbuddy-cn");
  authStorage.close();
  globalThis.fetch = previousFetch;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousIntlCatalog === undefined) delete process.env.WORKBUDDYAI_PRODUCT_CONFIG;
  else process.env.WORKBUDDYAI_PRODUCT_CONFIG = previousIntlCatalog;
  if (previousCnCatalog === undefined) delete process.env.WORKBUDDY_CN_PRODUCT_CONFIG;
  else process.env.WORKBUDDY_CN_PRODUCT_CONFIG = previousCnCatalog;
  refreshDirsFromEnv();
  await rm(temp, { recursive: true, force: true });
}
