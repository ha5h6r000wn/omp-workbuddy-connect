import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, type Model } from "@oh-my-pi/pi-ai";
import { unregisterOAuthProvider } from "@oh-my-pi/pi-ai/registry/oauth";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";

const temp = await mkdtemp(join(tmpdir(), "workbuddy-persisted-restart-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousProductConfig = process.env.WORKBUDDYAI_PRODUCT_CONFIG;
process.env.PI_CODING_AGENT_DIR = temp;
const productConfigPath = join(temp, "product-config.json");
process.env.WORKBUDDYAI_PRODUCT_CONFIG = productConfigPath;
await writeFile(productConfigPath, JSON.stringify({
  models: [{
    id: "hy3",
    name: "Hy3",
    credits: "x0.00",
    maxInputTokens: 192_000,
    maxOutputTokens: 64_000,
    supportsImages: true,
    supportsReasoning: true,
    reasoning: { supportedEfforts: ["low", "high"], canDisableThinking: false },
  }],
}));
const authStorage = await AuthStorage.create(join(temp, "auth.db"));
const registry = new ModelRegistry(authStorage, join(temp, "models.yml"), {
  cacheDbPath: join(temp, "models.db"),
});
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({
  code: 0,
  data: { Response: { Data: { Accounts: [] } } },
});
const expires = Date.now() + 60 * 60 * 1000;
await authStorage.credentials.set("workbuddy", {
  type: "oauth",
  access: "access-a",
  refresh: "refresh-a",
  expires,
  accountId: "account-a",
  orgId: "org-a",
});

const handlers: Record<string, Function[]> = {};
const extension = await import("../../extensions/workbuddy.ts");
const pi = {
  on(name: string, handler: Function) {
    (handlers[name] ??= []).push(handler);
  },
  registerProvider(name: string, config: Parameters<ModelRegistry["registerProvider"]>[1]) {
    registry.registerProvider(name, config);
  },
  unregisterProvider(name: string) {
    registry.unregisterProvider(name);
  },
  registerCommand() {},
};

function context(sessionId: string, model: Model | undefined): ExtensionContext {
  return {
    modelRegistry: registry,
    sessionManager: { getSessionId: () => sessionId },
    model,
    ui: { setWidget() {}, setStatus() {}, notify() {} },
  } as unknown as ExtensionContext;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  await extension.default(pi as never);
  const preBindModel = registry.find("workbuddy", "hy3");
  assert(preBindModel, "persisted account was filtered before session_start");
  assert(preBindModel.resolveHeaders, "pre-bind model did not receive the request identity resolver");

  const start = handlers.session_start?.[0];
  assert(start, "extension did not register session_start binding");
  await start({}, context("session-a", preBindModel));
  const retainedModel = registry.find("workbuddy", "hy3");
  assert(retainedModel, "persisted account disappeared after session_start binding");
  const keyA = await registry.getApiKey(retainedModel, "session-a");
  const headersA = await registry.resolveModelHeaders(retainedModel);
  assert(keyA === "access-a", `persisted host access was not restored: ${keyA}`);
  assert(headersA?.["X-User-Id"] === "account-a" && headersA["X-Enterprise-Id"] === "org-a", "persisted identity headers mismatch");

  await authStorage.credentials.remove("workbuddy");
  await authStorage.credentials.set("workbuddy", {
    type: "oauth",
    access: "access-b",
    refresh: "refresh-b",
    expires,
    accountId: "account-b",
    orgId: "org-b",
  });
  const sessionSwitch = handlers.session_switch?.[0];
  assert(sessionSwitch, "extension did not register session_switch binding");
  await sessionSwitch({}, context("session-b", retainedModel));
  const keyB = await registry.getApiKey(retainedModel, "session-b");
  const headersB = await retainedModel.resolveHeaders();
  assert(keyB === "access-b", `switched host access was stale: ${keyB}`);
  assert(headersB?.["X-User-Id"] === "account-b" && headersB["X-Enterprise-Id"] === "org-b", "retained model kept the old session identity");

  console.log("OK: persisted pre-bind model survives restart and session_switch resolves current identity");
} finally {
  globalThis.fetch = previousFetch;
  unregisterOAuthProvider("workbuddy");
  authStorage.close();
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousProductConfig === undefined) delete process.env.WORKBUDDYAI_PRODUCT_CONFIG;
  else process.env.WORKBUDDYAI_PRODUCT_CONFIG = previousProductConfig;
  await rm(temp, { recursive: true, force: true });
}
