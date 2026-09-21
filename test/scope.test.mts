import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const temp = await mkdtemp(join(tmpdir(), "workbuddy-payload-scope-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousProductConfig = process.env.WORKBUDDYAI_PRODUCT_CONFIG;
const previousCnProductConfig = process.env.WORKBUDDY_CN_PRODUCT_CONFIG;
const productConfigPath = join(temp, "product-config.json");
process.env.PI_CODING_AGENT_DIR = temp;
process.env.WORKBUDDYAI_PRODUCT_CONFIG = productConfigPath;
process.env.WORKBUDDY_CN_PRODUCT_CONFIG = productConfigPath;
await writeFile(productConfigPath, JSON.stringify({
  models: [{
    id: "contract-active",
    name: "Contract Active",
    credits: "x0.00",
    maxInputTokens: 32_000,
    maxOutputTokens: 4_096,
    supportsImages: false,
    supportsReasoning: true,
    reasoning: { supportedEfforts: ["low"], canDisableThinking: true },
  }],
}));

const { refreshDirsFromEnv } = await import("@oh-my-pi/pi-utils");
refreshDirsFromEnv();

try {
  const ext: any = await import("../extensions/workbuddy.ts");
  const { WORKBUDDY_INTL } = await import("../src/site.ts");
  const handlers: Record<string, Function[]> = {};
  const providers = new Map<string, unknown>();
  const commands = new Set<string>();
  const pi: any = {
    on: (name: string, fn: Function) => { (handlers[name] ??= []).push(fn); },
    registerProvider: (id: string, config: unknown) => providers.set(id, config),
    unregisterProvider: (id: string) => providers.delete(id),
    registerCommand: (name: string) => commands.add(name),
  };
  await ext.default(pi);
  assert(providers.has("workbuddy") && providers.has("workbuddy-cn"), "default entry did not register both realms");
  assert(commands.has("workbuddy") && commands.has("workbuddy-cn"), "realm management commands were not isolated");
  const hook = handlers.before_provider_request?.[0];
  assert(hook, "no before_provider_request handler");

  const foreign = {
    model: "grok-4.6",
    messages: [
      { role: "developer", content: "You are Grok." },
      { role: "assistant", content: "answer", reasoning: "private host state" },
      { role: "user", content: "hi" },
    ],
    stream: false,
    max_tokens: 777,
    reasoning_effort: "low",
    tool_choice: { type: "function", function: { name: "bash" } },
    tools: [{ type: "function", function: { name: "bash" } }],
    provider_specific_field: { keep: true },
  };
  const foreignBefore = JSON.stringify(foreign);
  const foreignCtx = { model: { provider: "foreign", id: "grok-4.6" } };
  assert(hook({ type: "before_provider_request", payload: foreign }, foreignCtx) === undefined, "foreign payload was replaced");
  assert(JSON.stringify(foreign) === foreignBefore, "foreign payload fields were changed");

  const active = { ...foreign, model: "contract-active" };
  const activeBefore = JSON.stringify(active);
  const workBuddyCtx = { model: { provider: "workbuddy", id: "contract-active" } };
  const activeResult = hook({ type: "before_provider_request", payload: active }, workBuddyCtx);
  assert(activeResult !== active, "active named WorkBuddy payload was not copied for compatibility");
  assert(activeResult.tool_choice === "bash", "active named tool choice was not encoded as a Gateway string");
  assert(JSON.stringify(active) === activeBefore, "active WorkBuddy host payload was mutated");

  const sameIdForeignResult = hook({ type: "before_provider_request", payload: active }, {
    model: { provider: "foreign", id: "contract-active" },
  });
  assert(sameIdForeignResult === undefined, "foreign provider with a WorkBuddy ID was rewritten");
  const cnBefore = JSON.stringify(active);
  assert(hook({ type: "before_provider_request", payload: active }, {
    model: { provider: "workbuddy-cn", id: "contract-active" },
  }) === undefined, "CN realm inherited the international payload transform");
  assert(JSON.stringify(active) === cnBefore, "CN realm mutated the host payload");
  assert(JSON.stringify(active) === activeBefore, "same-ID foreign payload was mutated");

  const historicalSameId = { ...active, model: "historical-workbuddy-id" };
  const historicalBefore = JSON.stringify(historicalSameId);
  assert(hook({ type: "before_provider_request", payload: historicalSameId }, {
    model: { provider: "foreign", id: "historical-workbuddy-id" },
  }) === undefined, "historical same-ID foreign payload was rejected or rewritten");
  assert(JSON.stringify(historicalSameId) === historicalBefore, "historical same-ID foreign payload was mutated");

  const activeAuto = { ...foreign, model: "contract-active", tool_choice: "auto" };
  assert(hook({ type: "before_provider_request", payload: activeAuto }, workBuddyCtx) === activeAuto, "compatible active payload identity changed");
  const disabledRuntime = ext.installRealm(pi, {
    ...WORKBUDDY_INTL,
    providerId: "workbuddy-cn",
    label: "WorkBuddy CN",
    commandName: "workbuddy-cn",
    settingsFile: ".workbuddy-cn-settings.json",
    widgetKey: "workbuddy-cn",
    payload: { normalizeNamedToolChoice: false },
    usage: { ...WORKBUDDY_INTL.usage, enabled: false },
  });
  const serialized = JSON.stringify(active);
  assert(disabledRuntime.transformPayload(serialized) === undefined, "disabled payload policy parsed or replaced the host payload");

  console.log("OK: request-bound provider identity isolates same-ID foreign payloads and applies only the WorkBuddy named-choice delta");
} finally {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousProductConfig === undefined) delete process.env.WORKBUDDYAI_PRODUCT_CONFIG;
  else process.env.WORKBUDDYAI_PRODUCT_CONFIG = previousProductConfig;
  if (previousCnProductConfig === undefined) delete process.env.WORKBUDDY_CN_PRODUCT_CONFIG;
  else process.env.WORKBUDDY_CN_PRODUCT_CONFIG = previousCnProductConfig;
  refreshDirsFromEnv();
  await rm(temp, { recursive: true, force: true });
}
