import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage } from "@oh-my-pi/pi-ai";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { WORKBUDDY_CN, WORKBUDDY_INTL } from "../src/site.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface PendingBilling {
  account: string | null;
  resolve(response: Response): void;
}

const temp = await mkdtemp(join(tmpdir(), "workbuddy-ui-"));
const productConfig = join(temp, "product-config.json");
await writeFile(productConfig, JSON.stringify({
  models: ["UI Model", "UI Model 2", "UI Model 3", "UI Model 4", "UI Model 5", "UI Model 6"].map((name, index) => ({
    id: index === 0 ? "ui-model" : `ui-model-${index + 1}`,
    name,
    credits: "x1.00",
    maxInputTokens: 32_000,
    maxOutputTokens: 4_096,
    supportsReasoning: false,
  })),
}));
await writeFile(join(temp, ".workbuddy-settings.json"), JSON.stringify({ scope: "all" }));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousProductConfig = process.env.WORKBUDDYAI_PRODUCT_CONFIG;
process.env.PI_CODING_AGENT_DIR = temp;
process.env.WORKBUDDYAI_PRODUCT_CONFIG = productConfig;
const { refreshDirsFromEnv } = await import("@oh-my-pi/pi-utils");
refreshDirsFromEnv();

const pending: PendingBilling[] = [];
let billingCalls = 0;
const authStorage = await AuthStorage.create(join(temp, "auth.db"), {
  usageFetch: async (_input, init) => {
    billingCalls += 1;
    return new Promise<Response>((resolve) => {
      pending.push({ account: new Headers(init?.headers).get("x-user-id"), resolve });
    });
  },
  usageRequestTimeoutMs: 5_000,
});
const registry = new ModelRegistry(authStorage, join(temp, "models.yml"), {
  cacheDbPath: join(temp, "models.db"),
});
const credential = (accountId: string, email?: string) => ({
  type: "oauth" as const,
  access: `access-${accountId}`,
  refresh: `refresh-${accountId}`,
  expires: Date.now() + 60 * 60 * 1000,
  accountId,
  ...(email ? { email } : {}),
});
await authStorage.set("workbuddy", credential("account-a", "employee@example.com"));

const handlers: Record<string, Function[]> = {};
let command: ((args: unknown, ctx: any) => Promise<void>) | undefined;
const pi = {
  on(name: string, handler: Function) { (handlers[name] ??= []).push(handler); },
  registerProvider(name: string, config: unknown) { registry.registerProvider(name, config as never); },
  unregisterProvider(name: string) { registry.unregisterProvider(name); },
  registerCommand(name: string, definition: { handler(args: unknown, ctx: any): Promise<void> }) {
    if (name === "workbuddy") command = definition.handler;
  },
};
const widgets: Array<string[] | undefined> = [];
const statuses: Array<string | undefined> = [];
const notifications: string[] = [];
const ui = {
  setWidget(_key: string, value: string[] | undefined) { widgets.push(value); },
  setStatus(_key: string, value: string | undefined) { statuses.push(value); },
  notify(message: string) { notifications.push(message); },
};
const ctx: any = {
  hasUI: true,
  model: { provider: "workbuddy", id: "ui-model" },
  modelRegistry: registry,
  sessionManager: { getSessionId: () => "ui-session" },
  ui,
};

function billingResponse(remaining: number, bonusRemaining?: number): Response {
  const accounts = [{
    PackageName: "Free Plan Subscription",
    CycleCapacitySize: 100,
    CycleCapacityRemain: remaining,
  }];
  if (bonusRemaining !== undefined) {
    accounts.push({
      PackageName: "Bonus Pack",
      CycleCapacitySize: 20,
      CycleCapacityRemain: bonusRemaining,
    });
  }
  return Response.json({
    code: 0,
    data: { Response: { Data: { Accounts: accounts } } },
  });
}

async function waitForCalls(expected: number): Promise<void> {
  for (let attempt = 0; attempt < 100 && billingCalls < expected; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert(billingCalls === expected, `expected ${expected} Billing calls, observed ${billingCalls}`);
}

try {
  const extension = await import("../extensions/workbuddy.ts");
  await extension.default(pi as never);
  const sessionStart = handlers.session_start?.[0];
  const sessionSwitch = handlers.session_switch?.[0];
  const turnStart = handlers.turn_start?.[0];
  const sessionShutdown = handlers.session_shutdown?.[0];
  assert(sessionStart && sessionSwitch && turnStart && sessionShutdown && command, "management handlers were not registered");

  const [snapshotAccount] = authStorage.listOAuthAccounts("workbuddy", "ui-session");
  assert(snapshotAccount, "snapshot regression setup could not load the WorkBuddy account");
  let snapshotAccountReads = 0;
  let resolveSnapshotReports!: (reports: undefined) => void;
  const snapshotReports = new Promise<undefined>((resolve) => {
    resolveSnapshotReports = resolve;
  });
  const snapshotCtx = {
    ...ctx,
    modelRegistry: {
      authStorage: {
        listOAuthAccounts() {
          snapshotAccountReads += 1;
          return [snapshotAccount];
        },
        async fetchUsageReports() {
          return snapshotReports;
        },
      },
    },
  };
  const { WorkBuddyUiController } = await import("../src/ui.ts");
  const snapshotController = new WorkBuddyUiController(WORKBUDDY_INTL, () => ({
    scope: "all",
    models: [],
    source: "desktop-cache",
    transitioning: false,
  }));
  snapshotController.beginSession(snapshotCtx);
  snapshotAccountReads = 0;
  const snapshotRefresh = snapshotController.refresh(snapshotCtx);
  assert(snapshotAccountReads === 1, `loading render reread OAuth accounts; observed ${snapshotAccountReads} reads`);
  resolveSnapshotReports(undefined);
  await snapshotRefresh;
  assert(snapshotAccountReads === 2, `one refresh should read OAuth accounts twice; observed ${snapshotAccountReads}`);
  const disabledSite = WORKBUDDY_CN;
  let disabledUsageCalls = 0;
  const disabledCtx = {
    ...ctx,
    model: { provider: "workbuddy-cn", id: "cn-model" },
    modelRegistry: {
      authStorage: {
        listOAuthAccounts() {
          return [snapshotAccount];
        },
        async invalidateUsageCache() {
          disabledUsageCalls += 1;
        },
        async fetchUsageReports() {
          disabledUsageCalls += 1;
          return [];
        },
      },
    },
  };
  const disabledController = new WorkBuddyUiController(disabledSite, () => ({
    scope: "all",
    models: [],
    source: "desktop-cache",
    transitioning: false,
  }));
  const disabledLines = await disabledController.refresh(disabledCtx, {
    forceRefresh: true,
    showWhenInactive: true,
    showWidget: true,
  });
  assert(disabledUsageCalls === 0, "disabled realm triggered aggregate Usage or Billing work");
  assert(
    disabledLines?.some((line) => line === "积分  不可用")
      && disabledLines.some((line) => line === "套餐  不可用"),
    "disabled realm did not render Usage as unavailable",
  );


  const startResult = await sessionStart({}, ctx);
  assert(startResult === undefined, "session_start returned an unexpected value");
  assert(billingCalls === 0, "session_start started unsolicited Billing");
  assert(widgets.at(-1) === undefined && statuses.at(-1) === undefined, "session_start mounted persistent WorkBuddy UI");

  const accountADetail = command("", ctx);
  await waitForCalls(1);
  assert(widgets.at(-1)?.some((line) => line === "积分  查询中"), "explicit status did not expose the pending state");
  assert(widgets.at(-1)?.some((line) => line === "账号  em***@example.com"), "email identity was not rendered redacted");
  assert(!widgets.at(-1)?.some((line) => line.includes("employee@example.com")), "email identity leaked into the Widget");
  pending[0]!.resolve(billingResponse(9, 4));
  await accountADetail;
  const accountALines = widgets.at(-1) ?? [];
  for (const field of ["账号  ", "范围  ", "模型  ", "积分  ", "套餐  ", "Provider  "]) {
    assert(accountALines.some((line) => line.startsWith(field)), `/workbuddy omitted ${field.trim()}`);
  }
  for (const redundantField of ["登录  ", "模型数  ", "目录  ", "设置  "]) {
    assert(!accountALines.some((line) => line.startsWith(redundantField)), `/workbuddy retained redundant ${redundantField.trim()}`);
  }
  assert(accountALines.some((line) => line === "积分  13"), "account A credits were not rendered");
  assert(accountALines.length === 7, "compact detail exceeded seven logical lines");
  assert(accountALines.some((line) => line.includes("Free Plan Subscription 9 / 100  |  Bonus Pack 4 / 20")), "multiple packs were not consolidated");
  assert(accountALines.some((line) => line === "范围  all · 6 模型 · desktop-cache"), "detail rendered the wrong all-scope model count");
  assert(accountALines.some((line) => line === "模型  UI Model · x1.00 | UI Model 2 · x1.00 | UI Model 3 · x1.00 | UI Model 4 · x1.00 | … +2"), "detail did not truncate a long model list");
  assert(statuses.at(-1) === undefined, "explicit status mounted a WorkBuddy status line");

  await turnStart({}, ctx);
  assert(widgets.at(-1) === undefined && statuses.at(-1) === undefined, "next turn did not dismiss WorkBuddy detail");
  assert(billingCalls === 1, "turn_start started unsolicited Billing");

  const staleAccountRefresh = command("", ctx);
  await waitForCalls(2);
  await authStorage.remove("workbuddy");
  await authStorage.set("workbuddy", credential("account-b"));
  await sessionSwitch({}, ctx);
  assert(billingCalls === 2, "session_switch started unsolicited Billing");
  assert(widgets.at(-1) === undefined, "session_switch did not dismiss WorkBuddy detail");
  const accountBDetail = command("", ctx);
  await waitForCalls(3);
  assert(pending[1]?.account === "account-a" && pending[2]?.account === "account-b", "account switch used the wrong host identity");
  const widgetsBeforeLateA = widgets.length;
  pending[1]!.resolve(billingResponse(99));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert(widgets.length === widgetsBeforeLateA, "late account A result repainted account B UI");
  pending[2]!.resolve(billingResponse(8));
  await Promise.all([staleAccountRefresh, accountBDetail]);
  assert(widgets.at(-1)?.some((line) => line === "账号  acco…nt-b"), "account B identity was not rendered redacted");
  assert(!widgets.at(-1)?.some((line) => line.includes("account-b")), "account B identity leaked into the Widget");
  assert(widgets.at(-1)?.some((line) => line === "积分  8"), "account B credits were not rendered");

  await authStorage.invalidateUsageCache("workbuddy");
  const staleScopeRefresh = command("", ctx);
  await waitForCalls(4);
  await command("free", ctx);
  assert(billingCalls === 4, "scope action started an unsolicited Billing request");
  pending[3]!.resolve(billingResponse(66));
  await staleScopeRefresh;
  assert(!widgets.at(-1)?.some((line) => line === "积分  66"), "old-scope result repainted the new scope");
  assert(widgets.at(-1) === undefined && statuses.at(-1) === undefined, "scope action mounted persistent UI");
  assert(notifications.some((message) => message.includes("范围已切换为 free")), "scope action did not report completion");

  const freeDetail = command("", ctx);
  await waitForCalls(5);
  pending[4]!.resolve(billingResponse(5));
  await freeDetail;
  assert(widgets.at(-1)?.some((line) => line === "范围  free · 0 模型 · desktop-cache"), "explicit status omitted the empty free scope");
  assert(widgets.at(-1)?.some((line) => line === "模型  （当前范围为空）"), "explicit status omitted the empty model state");

  await authStorage.invalidateUsageCache("workbuddy");
  const pendingDetail = command("", ctx);
  await waitForCalls(6);
  await turnStart({}, { ...ctx, model: { provider: "openai", id: "gpt" } });
  pending[5]!.resolve(billingResponse(6));
  await pendingDetail;
  assert(widgets.at(-1) === undefined && statuses.at(-1) === undefined, "late result restored UI after the next turn");

  const callsBeforeHeadless = billingCalls;
  const headlessUi = new Proxy({}, {
    get() { throw new Error("headless UI access"); },
  });
  const headlessCtx = { ...ctx, hasUI: false, ui: headlessUi, model: { provider: "workbuddy", id: "ui-model" } };
  await sessionSwitch({}, headlessCtx);
  await turnStart({}, headlessCtx);
  await command("", headlessCtx);
  assert(billingCalls === callsBeforeHeadless, "headless lifecycle started optional Billing or touched UI");

  const throwingCtx = {
    ...ctx,
    model: { provider: "workbuddy", id: "ui-model" },
    ui: {
      setWidget() { throw new Error("widget failure"); },
      setStatus() { throw new Error("status failure"); },
      notify() { throw new Error("notify failure"); },
    },
  };
  await turnStart({}, throwingCtx);
  await sessionShutdown({}, throwingCtx);

  console.log("OK: command-scoped detail, generation guards, optional UI failures, and headless isolation");
} finally {
  authStorage.close();
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousProductConfig === undefined) delete process.env.WORKBUDDYAI_PRODUCT_CONFIG;
  else process.env.WORKBUDDYAI_PRODUCT_CONFIG = previousProductConfig;
  refreshDirsFromEnv();
  await rm(temp, { recursive: true, force: true });
}
