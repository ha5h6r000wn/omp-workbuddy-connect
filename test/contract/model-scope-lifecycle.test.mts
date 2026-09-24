import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Context, Model } from "@oh-my-pi/pi-ai";
import type { ModelRegistry as ModelRegistryType } from "@oh-my-pi/pi-coding-agent/config/model-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const temp = await mkdtemp(join(tmpdir(), "workbuddy-model-scope-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousProductConfig = process.env.WORKBUDDYAI_PRODUCT_CONFIG;
const productConfigPath = join(temp, "product-config.json");
const settingsPath = join(temp, ".workbuddy-settings.json");
process.env.PI_CODING_AGENT_DIR = temp;
process.env.WORKBUDDYAI_PRODUCT_CONFIG = productConfigPath;
// OMP snapshots directory env at module load. Refresh explicitly before loading
// the extension so future import reordering cannot escape this isolated directory.
const { getAgentDir, refreshDirsFromEnv } = await import("@oh-my-pi/pi-utils");
refreshDirsFromEnv();
assert(getAgentDir() === temp, "OMP agent directory was not isolated");
const { AuthStorage, streamSimple } = await import("@oh-my-pi/pi-ai");
const { unregisterOAuthProvider } = await import("@oh-my-pi/pi-ai/registry/oauth");
const { ModelRegistry } = await import("@oh-my-pi/pi-coding-agent/config/model-registry");

const contractSample: unknown = JSON.parse(
  await readFile(new URL("../fixtures/model-scope-contract.json", import.meta.url), "utf8"),
);
assert(
  typeof contractSample === "object"
    && contractSample !== null
    && "models" in contractSample
    && Array.isArray(contractSample.models),
  "synthetic model scope contract fixture has an invalid root",
);
const contractModels: unknown[] = contractSample.models;
await writeFile(productConfigPath, `${JSON.stringify(contractSample, null, 2)}\n`);

const authStorage = await AuthStorage.create(join(temp, "auth.db"));
const registry = new ModelRegistry(authStorage, join(temp, "models.yml"), {
  cacheDbPath: join(temp, "models.db"),
});
const expires = Date.now() + 60 * 60 * 1000;
await authStorage.credentials.set("workbuddy", {
  type: "oauth",
  access: "scope-access",
  refresh: "scope-refresh",
  expires,
  accountId: "scope-account",
  orgId: "scope-org",
});
const credentialBefore = JSON.stringify(authStorage.credentials.get("workbuddy"));
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({
  code: 0,
  data: { Response: { Data: { Accounts: [] } } },
});

const handlers: Record<string, Function[]> = {};
let command: ((args: unknown, ctx: any) => Promise<void>) | undefined;
let failNextRegister = false;
let unregisterCalls = 0;
const pi: any = {
  on(name: string, handler: Function) {
    (handlers[name] ??= []).push(handler);
  },
  unregisterProvider(name: string) {
    unregisterCalls += 1;
    registry.unregisterProvider(name);
  },
  registerProvider(name: string, config: Parameters<ModelRegistryType["registerProvider"]>[1]) {
    if (failNextRegister) {
      failNextRegister = false;
      throw new Error("simulated registration failure");
    }
    registry.registerProvider(name, config);
  },
  registerCommand(name: string, definition: { handler(args: unknown, ctx: any): Promise<void> }) {
    if (name === "workbuddy") command = definition.handler;
  },
};

const widgets: Array<string[] | undefined> = [];
const notifications: Array<{ message: string; type?: string }> = [];
const ctx: any = {
  hasUI: true,
  model: undefined,
  modelRegistry: registry,
  sessionManager: { getSessionId: () => "scope-contract" },
  ui: {
    setWidget(_key: string, content: string[] | undefined) { widgets.push(content); },
    setStatus() {},
    notify(message: string, type?: string) { notifications.push({ message, type }); },
    async select() { return undefined; },
  },
};

try {
  const extension = await import("../../extensions/workbuddy.ts");
  await extension.default(pi);
  assert(command, "extension did not register /workbuddy");
  const sessionStart = handlers.session_start?.[0];
  assert(sessionStart, "extension did not register session_start");
  await sessionStart({}, ctx);
  await command("all", ctx);
  assert(widgets.at(-1) === undefined, "scope action mounted persistent WorkBuddy detail");
  await command("", ctx);

  const high = registry.find("workbuddy", "contract-free-high");
  const multi = registry.find("workbuddy", "contract-free-multi");
  const text = registry.find("workbuddy", "contract-free-text");
  const retained = registry.find("workbuddy", "contract-paid");
  assert(high && multi && text && retained, "synthetic catalog did not register every model in all scope");
  assert(high.contextWindow === 1_000_000 && high.maxTokens === 64_000, "high-effort model budgets changed");
  assert(high.input.includes("image") && high.reasoning, "high-effort model Vision/reasoning metadata changed");
  assert(
    high.thinking?.efforts.join(",") === "high"
      && high.thinking.requiresEffort
      && high.thinking.defaultLevel === "high",
    "high-effort model canonical thinking metadata changed",
  );
  assert(multi.contextWindow === 192_000 && multi.maxTokens === 64_000, "multi-effort model budgets changed");
  assert(
    multi.thinking?.efforts.join(",") === "low,high"
      && multi.thinking.requiresEffort
      && multi.thinking.defaultLevel === "high",
    "multi-effort model canonical thinking metadata changed",
  );
  assert(text.input.join(",") === "text" && !text.reasoning, "text-only model capabilities changed");
  assert(retained.contextWindow === 200_000 && retained.maxTokens === 32_000 && retained.input.includes("image"), "paid model metadata changed");
  assert(unregisterCalls === 0, "non-empty registration unnecessarily tore down the provider");
  assert(widgets.some((lines) => lines?.some((line) => line.includes("范围  all · 4 模型 · desktop-cache"))), "explicit status did not expose the Desktop cache source");
  assert(JSON.parse(await readFile(settingsPath, "utf8")).scope === "all", "all scope was not persisted");

  ctx.model = retained;
  failNextRegister = true;
  await command("free", ctx);
  assert(registry.find("workbuddy", "contract-paid"), "registration failure did not restore the previous provider");
  assert(JSON.parse(await readFile(settingsPath, "utf8")).scope === "all", "registration failure persisted an uncommitted scope");
  assert(notifications.at(-1)?.type === "error", "registration failure was falsely reported as success");

  if (process.platform !== "win32") {
    const committedSettings = await readFile(settingsPath, "utf8");
    await chmod(temp, 0o500);
    try {
      await command("free", ctx);
    } finally {
      await chmod(temp, 0o700);
    }
    assert(registry.find("workbuddy", "contract-paid"), "settings failure did not restore the previous provider");
    assert(await readFile(settingsPath, "utf8") === committedSettings, "settings failure changed committed bytes");
    assert(notifications.at(-1)?.type === "error", "settings failure was falsely reported as success");
    assert(unregisterCalls === 0, "non-empty rollback unnecessarily tore down the provider");
  }

  const paidModel = contractModels.find(
    (model) => typeof model === "object" && model !== null && "id" in model && model.id === "contract-paid",
  );
  assert(paidModel, "synthetic paid model fixture is missing");
  await writeFile(productConfigPath, `${JSON.stringify({ models: [paidModel] }, null, 2)}\n`);
  failNextRegister = true;
  await command("free", ctx);
  assert(registry.find("workbuddy", "contract-paid"), "failed empty registration did not restore the previous provider");
  assert(JSON.parse(await readFile(settingsPath, "utf8")).scope === "all", "failed empty registration persisted an uncommitted scope");
  assert(unregisterCalls === 1, "failed empty registration did not exercise stale-overlay cleanup exactly once");
  assert(notifications.at(-1)?.type === "error", "failed empty registration was falsely reported as success");
  await command("free", ctx);
  assert(!registry.getAll().some((model) => model.provider === "workbuddy"), "empty free scope retained stale WorkBuddy models");
  assert(unregisterCalls === 2, "successful empty scope did not perform its stale-overlay cleanup");
  assert(JSON.parse(await readFile(settingsPath, "utf8")).scope === "free", "empty free scope was not persisted");
  assert(notifications.some((item) => item.type === "warning" && item.message.includes("重新选择模型")), "removed current model did not prompt reselection");
  assert(widgets.at(-1) === undefined, "empty scope action mounted persistent WorkBuddy detail");
  await command("", ctx);
  assert(widgets.at(-1)?.some((line) => line === "模型  （当前范围为空）"), "explicit status did not expose the empty scope");

  let chatRequests = 0;
  const chatFetch: typeof fetch = async () => {
    chatRequests += 1;
    return new Response(null, { status: 500 });
  };
  const chatContext: Context = {
    messages: [{ role: "user", content: "must be blocked", timestamp: Date.now() }],
  };
  let blockedError: unknown;
  try {
    const stream = streamSimple(retained as Model, chatContext, {
      apiKey: "scope-access",
      fetch: chatFetch,
    });
    for await (const _event of stream) {
      // Drain the real OMP transport; Model.resolveHeaders must stop it before fetch.
    }
    const result = await stream.result();
    if (result.stopReason === "error") blockedError = new Error(result.errorMessage);
  } catch (error) {
    blockedError = error;
  }
  assert(blockedError instanceof Error && blockedError.message.includes("outside the active"), "retained model was not blocked by its resolver");
  assert(chatRequests === 0, `retained model reached WorkBuddy HTTP ${chatRequests} time(s)`);
  assert(JSON.stringify(authStorage.credentials.get("workbuddy")) === credentialBefore, "scope changes modified the OMP credential row");

  const restartHandlers: Record<string, Function[]> = {};
  const restartPi = {
    ...pi,
    on(name: string, handler: Function) {
      (restartHandlers[name] ??= []).push(handler);
    },
    registerCommand() {},
  };
  await extension.default(restartPi as never);
  assert(!registry.getAll().some((model) => model.provider === "workbuddy"), "restart widened an authoritative empty free scope");
  assert(JSON.stringify(authStorage.credentials.get("workbuddy")) === credentialBefore, "restart registration modified the OMP credential row");

  console.log("OK: M2 synthetic metadata, transactional scope, retained-model guard, restart, and credential invariants");
} finally {
  unregisterOAuthProvider("workbuddy");
  globalThis.fetch = previousFetch;
  authStorage.close();
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousProductConfig === undefined) delete process.env.WORKBUDDYAI_PRODUCT_CONFIG;
  else process.env.WORKBUDDYAI_PRODUCT_CONFIG = previousProductConfig;
  refreshDirsFromEnv();
  await rm(temp, { recursive: true, force: true });
}
