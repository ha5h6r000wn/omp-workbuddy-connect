import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage } from "@oh-my-pi/pi-ai";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import type { Model } from "@oh-my-pi/pi-ai";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const temp = await mkdtemp(join(tmpdir(), "workbuddy-logout-contract-"));
const desktopDir = join(temp, "desktop-client");
const desktopCredential = join(desktopDir, "credential.json");
await mkdir(desktopDir, { recursive: true });
await writeFile(desktopCredential, "desktop-owned-credential\n");
const desktopBefore = await readFile(desktopCredential, "utf8");
const productConfigPath = join(temp, "product-config.json");
await writeFile(productConfigPath, JSON.stringify({
  models: [{
    id: "hy3",
    name: "Hy3",
    credits: "x0.00",
    maxInputTokens: 192_000,
    maxOutputTokens: 64_000,
    supportsReasoning: true,
    reasoning: { supportedEfforts: ["low", "high"], canDisableThinking: false },
  }],
}));

const authStorage = await AuthStorage.create(join(temp, "auth.db"), {
  usageFetch: (input, init) => globalThis.fetch(input, init),
});
const registry = new ModelRegistry(authStorage, join(temp, "models.yml"), {
  cacheDbPath: join(temp, "models.db"),
});
await authStorage.credentials.set("workbuddy", {
  type: "oauth",
  access: "access-a",
  refresh: "refresh-a",
  expires: Date.now() + 60 * 60 * 1000,
  accountId: "account-a",
  orgId: "org-a",
});

const originalFetch = globalThis.fetch;
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalProductConfig = process.env.WORKBUDDYAI_PRODUCT_CONFIG;
process.env.WORKBUDDYAI_PRODUCT_CONFIG = productConfigPath;
process.env.PI_CODING_AGENT_DIR = temp;
const { refreshDirsFromEnv } = await import("@oh-my-pi/pi-utils");
refreshDirsFromEnv();
let releaseBilling!: (response: Response) => void;
let billingCalls = 0;
globalThis.fetch = async () => {
  billingCalls += 1;
  return new Promise<Response>((resolve) => {
    releaseBilling = resolve;
  });
};

const handlers: Record<string, Function[]> = {};
let command: ((args: unknown, ctx: any) => Promise<void>) | undefined;
let failNextRegister = false;
const pi: any = {
  on(name: string, handler: Function) {
    (handlers[name] ??= []).push(handler);
  },
  registerProvider(name: string, config: unknown) {
    if (failNextRegister) {
      failNextRegister = false;
      throw new Error("simulated provider refresh failure");
    }
    registry.registerProvider(name, config as never);
  },
  unregisterProvider(name: string) {
    registry.unregisterProvider(name);
  },
  registerCommand(name: string, definition: { handler(args: unknown, ctx: any): Promise<void> }) {
    if (name === "workbuddy") command = definition.handler;
  },
};

const widgets: Array<string[] | undefined> = [];
const statuses: Array<string | undefined> = [];
const notifications: Array<{ message: string; type?: string }> = [];
const ui = {
  setWidget(_key: string, content: string[] | undefined) { widgets.push(content); },
  setStatus(_key: string, text: string | undefined) { statuses.push(text); },
  notify(message: string, type?: string) { notifications.push({ message, type }); },
  async select() { return undefined; },
};
const ctx = {
  hasUI: true,
  model: { provider: "workbuddy" },
  modelRegistry: registry,
  sessionManager: { getSessionId: () => "logout-contract" },
  ui,
};

try {
  const extension = await import("../../extensions/workbuddy.ts");
  await extension.default(pi);
  const start = handlers.session_start?.[0];
  assert(start && command, "extension did not register lifecycle and command handlers");
  await start({}, ctx);
  const pendingDetail = command("", ctx);

  for (let attempt = 0; attempt < 50 && billingCalls === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert(billingCalls === 1, "pending Billing request did not start");

  const retained = registry.find("workbuddy", "hy3") as Model | undefined;
  assert(retained?.resolveHeaders, "retained WorkBuddy model has no identity resolver");

  const originalRemove = authStorage.credentials.remove.bind(authStorage.credentials);
  authStorage.credentials.remove = async () => {
    throw new Error("simulated host delete failure");
  };
  await command("logout", ctx);
  assert(notifications.at(-1)?.type === "error", "failed logout was not surfaced as an error");
  assert(!notifications.at(-1)?.message.includes("已断开"), "failed logout reported success");

  const keyAfterFailure = await registry.getApiKey(retained, "logout-contract");
  assert(keyAfterFailure === "access-a", "failed host deletion did not restore the prior Bearer");
  const headersAfterFailure = await retained.resolveHeaders();
  assert(
    headersAfterFailure?.["X-User-Id"] === "account-a"
      && headersAfterFailure["X-Enterprise-Id"] === "org-a",
    "failed host deletion did not restore the prior usable authentication state",
  );

  authStorage.credentials.remove = originalRemove;
  failNextRegister = true;
  await command("logout", ctx);
  assert(authStorage.oauth.accounts("workbuddy").length === 0, "provider-scoped logout did not delete host credentials");
  assert(
    notifications.at(-1)?.type === "warning"
      && notifications.at(-1)?.message.includes("已断开登录")
      && notifications.at(-1)?.message.includes("Provider 状态刷新失败"),
    "post-delete provider refresh failure obscured the successful logout",
  );
  assert(widgets.at(-1) === undefined && statuses.at(-1) === undefined, "logout did not clear Widget/status");

  let resolverAfterSuccessRejected = false;
  try {
    await retained.resolveHeaders();
  } catch {
    resolverAfterSuccessRejected = true;
  }
  assert(resolverAfterSuccessRejected, "successful logout left the old identity resolver usable");

  releaseBilling(Response.json({
    code: 0,
    data: { Response: { Data: { Accounts: [{ PackageName: "late A", CapacityRemain: 99 }] } } },
  }));
  await pendingDetail;
  assert(widgets.at(-1) === undefined && statuses.at(-1) === undefined, "late A Billing result restored logged-out UI");

  statuses.push("积分 99");
  const turnStart = handlers.turn_start?.[0];
  assert(turnStart, "extension did not register turn_start");
  await turnStart({}, { ...ctx, model: { provider: "openai" } });
  assert(statuses.at(-1) === undefined, "switching away from WorkBuddy left stale status text");
  assert(await readFile(desktopCredential, "utf8") === desktopBefore, "logout modified Desktop-owned client data");

  console.log("OK: provider logout is scoped, fail-closed, stale-safe, and leaves Desktop data unchanged");
} finally {
  authStorage.close();
  globalThis.fetch = originalFetch;
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  if (originalProductConfig === undefined) delete process.env.WORKBUDDYAI_PRODUCT_CONFIG;
  else process.env.WORKBUDDYAI_PRODUCT_CONFIG = originalProductConfig;
  refreshDirsFromEnv();
  await rm(temp, { recursive: true, force: true });
}
