import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AuthStorage, type AssistantMessage, type Context, type Model, type SimpleStreamOptions } from "@oh-my-pi/pi-ai";
import { AssistantMessageEventStream } from "@oh-my-pi/pi-ai/utils/event-stream";
import { Settings } from "@oh-my-pi/pi-coding-agent";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { runSubprocess } from "@oh-my-pi/pi-coding-agent/task/executor";
import type { AgentDefinition } from "@oh-my-pi/pi-coding-agent/task/types";

const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), "workbuddy-task-contract-"));
const previousTaskLog = process.env.WORKBUDDY_TASK_CONTRACT_LOG;
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousAuthFile = process.env.WORKBUDDY_AUTH_FILE;
const previousProductConfig = process.env.WORKBUDDYAI_PRODUCT_CONFIG;
const observerLog = join(temp, "observer.jsonl");
process.env.WORKBUDDY_TASK_CONTRACT_LOG = observerLog;
process.env.PI_CODING_AGENT_DIR = temp;
process.env.WORKBUDDY_AUTH_FILE = join(temp, "missing-desktop-auth.json");
const productConfigPath = join(temp, "product-config.json");
process.env.WORKBUDDYAI_PRODUCT_CONFIG = productConfigPath;
const { refreshDirsFromEnv } = await import("@oh-my-pi/pi-utils");
refreshDirsFromEnv();
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

let mode: "yield" | "hang" = "yield";
let transportCalls = 0;
let startedResolve: (() => void) | undefined;
let transportStarted = new Promise<void>((resolveStarted) => { startedResolve = resolveStarted; });

function assistant(model: Model, content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"]): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: Date.now(),
  };
}

function probeStream(model: Model, _context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
  transportCalls += 1;
  startedResolve?.();
  const stream = new AssistantMessageEventStream();
  void (async () => {
    try {
      await options?.onPayload?.({ model: model.id, stream: false, messages: [] }, model);
      if (mode === "hang") {
        await new Promise<void>((_resolve, reject) => {
          const signal = options?.signal;
          if (signal?.aborted) reject(signal.reason ?? new Error("aborted"));
          signal?.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), { once: true });
        });
        return;
      }
      const toolCall = {
        type: "toolCall" as const,
        id: `yield-${transportCalls}`,
        name: "yield",
        arguments: { data: "task-contract-ok" },
      };
      const initial = assistant(model, [], "toolUse");
      const completed = assistant(model, [toolCall], "toolUse");
      stream.push({ type: "start", partial: initial });
      stream.push({ type: "toolcall_start", contentIndex: 0, partial: initial });
      stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: completed });
      stream.push({ type: "done", reason: "toolUse", message: completed });
    } catch (error) {
      const failed = assistant(model, [], options?.signal?.aborted ? "aborted" : "error");
      failed.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: failed.stopReason === "aborted" ? "aborted" : "error", error: failed });
    }
  })();
  return stream;
}

const providerConfig = {
  baseUrl: "https://probe.invalid/v1",
  api: "workbuddy-task-contract",
  streamSimple: probeStream,
  oauth: {
    name: "WorkBuddy Task Contract",
    async login() { throw new Error("test login is not callable"); },
    getApiKey(credentials: { access: string }) { return credentials.access; },
  },
  models: [{
    id: "hy3",
    name: "Task Contract Hy3",
    api: "workbuddy-task-contract",
    reasoning: false,
    input: ["text"] as ("text" | "image")[],
    supportsTools: true,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_000,
    maxTokens: 4_096,
  }],
};

const agent: AgentDefinition = {
  name: "workbuddy-task-contract",
  description: "Exercises the actual Task executor lifecycle",
  systemPrompt: "Immediately submit the requested result with the yield tool.",
  tools: [],
  model: ["@task"],
  source: "user",
};
const settings = Settings.isolated({
  modelRoles: { task: "workbuddy/hy3" },
  "task.maxRuntimeMs": 10_000,
  "task.agentIdleTtlMs": 0,
});
const authStorage = await AuthStorage.create(join(temp, "auth.db"));
const modelRegistry = new ModelRegistry(authStorage, join(temp, "models.yml"), {
  settings,
  cacheDbPath: join(temp, "models.db"),
});

function installProbeProvider(): void {
  // Model resolution retains this custom-api Model object. Loading the real
  // WorkBuddy extension later re-registers registry rows but must not redirect
  // the already-resolved Task model away from probeStream.
  modelRegistry.registerProvider("workbuddy", providerConfig);
}

async function setAccounts(count: 1 | 2): Promise<void> {
  const expires = Date.now() + 60 * 60 * 1000;
  await authStorage.credentials.set("workbuddy", Array.from({ length: count }, (_, index) => ({
    type: "oauth" as const,
    access: `access-${index + 1}`,
    refresh: `refresh-${index + 1}`,
    expires,
    accountId: `account-${index + 1}`,
    orgId: `org-${index + 1}`,
  })));
}

const getApiKey = async (model: Model): Promise<string | undefined> => {
  if (model.provider !== "workbuddy") return undefined;
  const accounts = authStorage.oauth.accounts("workbuddy");
  if (accounts.length !== 1) throw new Error(`expected one WorkBuddy account; found ${accounts.length}`);
  const credential = authStorage.credentials.get("workbuddy");
  return credential?.type === "oauth" ? credential.access : undefined;
};

let index = 0;
async function execute(id: string, signal?: AbortSignal) {
  installProbeProvider();
  return runSubprocess({
    cwd: root,
    agent,
    task: `Task runtime contract ${id}`,
    index: ++index,
    id,
    modelRole: "task",
    signal,
    settings,
    authStorage,
    modelRegistry,
    getApiKey,
    preloadedExtensionPaths: [
      resolve(root, "extensions/workbuddy.ts"),
      resolve(root, "test/contract/fixtures/task-observer-extension.ts"),
    ],
    enableIrc: false,
    enableLsp: false,
    enableMCP: false,
    keepAlive: false,
    cleanupGraceMs: 1_000,
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  await setAccounts(1);
  const success = await execute("success");
  assert(success.exitCode === 0, `Task failed: ${success.error ?? success.stderr}`);
  assert(success.output.includes("task-contract-ok"), `missing yield output: ${success.output}`);
  assert(success.resolvedModel?.includes("workbuddy/hy3"), `wrong role model: ${success.resolvedModel}`);
  assert(transportCalls === 1, `custom transport collision: expected 1 call, saw ${transportCalls}`);

  mode = "hang";
  transportStarted = new Promise<void>((resolveStarted) => { startedResolve = resolveStarted; });
  const controller = new AbortController();
  const pending = execute("abort", controller.signal);
  await transportStarted;
  controller.abort(new Error("Task contract cancellation"));
  const aborted = await pending;
  assert(aborted.aborted === true, "Task abort was not reported");
  assert(transportCalls === 2, `abort did not use custom transport: ${transportCalls}`);

  const beforeAmbiguous = transportCalls;
  await setAccounts(2);
  mode = "yield";
  const ambiguous = await execute("ambiguous");
  assert(ambiguous.exitCode !== 0, "two stored accounts unexpectedly dispatched");
  assert(transportCalls === beforeAmbiguous, "two stored accounts reached provider transport");

  const events = (await readFile(observerLog, "utf8")).trim().split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const starts = events.filter((event) => event.event === "session_start");
  const hooks = events.filter((event) => event.event === "before_provider_request");
  const factories = events.filter((event) => event.event === "factory");
  const shutdowns = events.filter((event) => event.event === "session_shutdown");
  assert(starts.length === 3 && starts.every((event) => event.hasUI === false), "Task sessions were not headless");
  assert(starts.every((event) => event.provider === "workbuddy" && event.model === "hy3"), "role model mismatch");
  assert(hooks.length === 2 && hooks.every((event) => event.model === "hy3" && event.stream === false), "hook changed host payload");
  assert(new Set(factories.map((event) => event.instance)).size === 3, "extension factories were not independent");
  assert(shutdowns.length === 3, `expected 3 shutdowns, saw ${shutdowns.length}`);

  console.log("OK: actual Task runtime role, custom transport, hooks, abort, shutdown, and account guard");
} finally {
  authStorage.close();
  if (previousTaskLog === undefined) delete process.env.WORKBUDDY_TASK_CONTRACT_LOG;
  else process.env.WORKBUDDY_TASK_CONTRACT_LOG = previousTaskLog;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousAuthFile === undefined) delete process.env.WORKBUDDY_AUTH_FILE;
  else process.env.WORKBUDDY_AUTH_FILE = previousAuthFile;
  if (previousProductConfig === undefined) delete process.env.WORKBUDDYAI_PRODUCT_CONFIG;
  else process.env.WORKBUDDYAI_PRODUCT_CONFIG = previousProductConfig;
  refreshDirsFromEnv();
  await rm(temp, { recursive: true, force: true });
}
