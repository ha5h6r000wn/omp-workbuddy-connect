import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthStorage,
  streamSimple,
  type Context,
  type Model,
  type OAuthCredentials,
} from "@oh-my-pi/pi-ai";
import { unregisterOAuthProvider } from "@oh-my-pi/pi-ai/registry/oauth";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { createWorkBuddyProvider } from "../../src/provider.ts";
import { WORKBUDDY_INTL } from "../../src/site.ts";

const SESSION = "request-identity-contract";
const SECOND_SESSION = "request-identity-contract-b";
const PROVIDER_ID = WORKBUDDY_INTL.providerId;
const temp = await mkdtemp(join(tmpdir(), "workbuddy-identity-contract-"));
const authStorage = await AuthStorage.create(join(temp, "auth.db"));
let refreshNumber = 1;
const refreshFetch: typeof fetch = async (input) => {
  if (!String(input).endsWith("/v2/plugin/auth/token/refresh")) {
    throw new Error(`unexpected production protocol request: ${String(input)}`);
  }
  refreshNumber += 1;
  return Response.json({
    code: 0,
    data: {
      accessToken: `access-a${refreshNumber}`,
      refreshToken: `refresh-a${refreshNumber}`,
      expiresIn: 3600,
      uid: "account-a",
      enterpriseId: "org-a",
    },
  });
};

const registry = new ModelRegistry(authStorage, join(temp, "models.yml"), {
  cacheDbPath: join(temp, "models.db"),
});
const controller = createWorkBuddyProvider(WORKBUDDY_INTL, refreshFetch);
controller.setModelAccess(new Set(["hy3"]), false);
await authStorage.credentials.set(PROVIDER_ID, {
  type: "oauth",
  access: "access-a1",
  refresh: "refresh-account-a",
  expires: Date.now() + 60 * 60 * 1000,
  accountId: "account-a",
  orgId: "org-a",
});
registry.registerProvider(PROVIDER_ID, controller.config([{
  id: "hy3",
  name: "Identity Contract Hy3",
  reasoning: false,
  input: ["text"],
  supportsTools: true,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32_000,
  maxTokens: 4_096,
}]));
const preBindModel = registry.find(PROVIDER_ID, "hy3");
if (!preBindModel) throw new Error("persisted credential disappeared before session_start binding");
controller.bindContext({
  modelRegistry: registry,
  sessionManager: { getSessionId: () => SESSION },
} as unknown as ExtensionContext);
const retainedModel = currentModel();
const originalResolveHeaders = retainedModel.resolveHeaders;
if (!originalResolveHeaders) throw new Error("production WorkBuddy model has no identity header resolver");
let headerResolutionCount = 0;
let firstHeaderSawActiveCredential: boolean | undefined;
retainedModel.resolveHeaders = async (signal?: AbortSignal) => {
  headerResolutionCount += 1;
  if (firstHeaderSawActiveCredential === undefined) {
    firstHeaderSawActiveCredential = authStorage.oauth
      .accounts(PROVIDER_ID, SESSION)
      .some((account) => account.active);
  }
  return originalResolveHeaders(signal);
};

interface Attempt {
  authorization: string | null;
  userId: string | null;
  orgId: string | null;
  noEnterprise: string | null;
  origin: string | null;
  domain: string | null;
  product: string | null;
  status: number;
}
const attempts: Attempt[] = [];
let failNextWith401 = false;

function completionResponse(): Response {
  const now = Math.floor(Date.now() / 1000);
  const body = [
    `data: ${JSON.stringify({ id: "chatcmpl-contract", object: "chat.completion.chunk", created: now, model: "hy3", choices: [{ index: 0, delta: { content: "ok" }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ id: "chatcmpl-contract", object: "chat.completion.chunk", created: now, model: "hy3", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const chatFetch: typeof fetch = async (_input, init) => {
  const headers = new Headers(init?.headers);
  const status = failNextWith401 ? 401 : 200;
  attempts.push({
    authorization: headers.get("authorization"),
    userId: headers.get("x-user-id"),
    orgId: headers.get("x-enterprise-id"),
    noEnterprise: headers.get("x-no-enterprise-id"),
    origin: headers.get("origin"),
    domain: headers.get("x-domain"),
    product: headers.get("x-product"),
    status,
  });
  if (failNextWith401) {
    failNextWith401 = false;
    return new Response(JSON.stringify({ error: { message: "expired", type: "authentication_error" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return completionResponse();
};

const context: Context = {
  messages: [{ role: "user", content: "contract", timestamp: Date.now() }],
};

function currentModel(): Model {
  const model = registry.find(PROVIDER_ID, "hy3");
  if (!model) throw new Error("production WorkBuddy model was not projected");
  return model;
}

async function request(model: Model, sessionId = SESSION): Promise<void> {
  const stream = streamSimple(model, context, {
    apiKey: authStorage.keys.resolver(PROVIDER_ID, {
      sessionId,
      baseUrl: model.baseUrl,
      modelId: model.id,
    }),
    fetch: chatFetch,
    maxTokens: 16,
  });
  for await (const _event of stream) {
    // Drain the real OMP openai-completions stream.
  }
  const result = await stream.result();
  if (result.stopReason !== "stop") throw new Error(result.errorMessage ?? `unexpected stop: ${result.stopReason}`);
}

function oauth(
  access: string,
  accountId: string,
  orgId: string | undefined,
  expires: number,
): OAuthCredentials & { type: "oauth" } {
  return { type: "oauth", access, refresh: `refresh-${accountId}`, expires, accountId, ...(orgId ? { orgId } : {}) };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  await request(retainedModel);
  const normal = attempts.at(-1)!;
  assert(normal.authorization === "Bearer access-a1", `normal bearer: ${normal.authorization}`);
  assert(normal.userId === "account-a" && normal.orgId === "org-a", `normal identity mismatch: ${JSON.stringify(normal)}`);
  assert(firstHeaderSawActiveCredential === true, "host did not select the request credential before resolving identity headers");
  assert(normal.origin === "https://www.workbuddy.ai", "fixed Origin missing");
  assert(normal.domain === "www.workbuddy.ai" && normal.product === "SaaS", "fixed WorkBuddy headers missing");

  await authStorage.credentials.set(PROVIDER_ID, oauth("access-a1", "account-a", "org-a", Date.now() - 1));
  await request(retainedModel);
  const forced = attempts.at(-1)!;
  assert(forced.authorization === "Bearer access-a2", `forced refresh bearer: ${forced.authorization}`);
  assert(forced.userId === "account-a" && forced.orgId === "org-a", "forced refresh changed identity");

  failNextWith401 = true;
  const retryHeaderStart = headerResolutionCount;
  const retryStart = attempts.length;
  await request(retainedModel);
  const retry = attempts.slice(retryStart);
  assert(retry.length === 2, `expected 401 plus retry, saw ${retry.length}`);
  assert(retry[0]?.authorization === "Bearer access-a2" && retry[0]?.status === 401, "401 first attempt mismatch");
  assert(retry[1]?.authorization === "Bearer access-a3" && retry[1]?.status === 200, "401 refresh bearer mismatch");
  assert(
    headerResolutionCount === retryHeaderStart + 2,
    `401 attempt and retry did not each resolve identity headers: ${headerResolutionCount - retryHeaderStart}`,
  );
  assert(retry.every((attempt) => attempt.userId === "account-a" && attempt.orgId === "org-a"), "401 retry crossed identity");

  await authStorage.credentials.remove(PROVIDER_ID);
  await authStorage.credentials.set(PROVIDER_ID, oauth("access-b1", "account-b", "org-b", Date.now() + 60 * 60 * 1000));
  await request(retainedModel, SECOND_SESSION);
  const switched = attempts.at(-1)!;
  assert(switched.authorization === "Bearer access-b1", "retained model did not resolve B bearer");
  assert(switched.userId === "account-b" && switched.orgId === "org-b", "retained model kept A identity");
  assert(
    authStorage.oauth.accounts(PROVIDER_ID, SECOND_SESSION).some((account) => account.active),
    "second request session did not select B",
  );
  assert(
    !authStorage.oauth.accounts(PROVIDER_ID, SESSION).some((account) => account.active),
    "deleted A remained active in the original session",
  );

  await authStorage.credentials.set(PROVIDER_ID, [
    oauth("access-b1", "account-b", "org-b", Date.now() + 60 * 60 * 1000),
    oauth("access-c1", "account-c", "org-c", Date.now() + 60 * 60 * 1000),
  ]);
  const beforeAmbiguous = attempts.length;
  let ambiguityRejected = false;
  try {
    await request(retainedModel);
  } catch {
    ambiguityRejected = true;
  }
  assert(ambiguityRejected, "two stored accounts were not rejected explicitly");
  assert(attempts.length === beforeAmbiguous, "two stored accounts reached provider transport");

  await authStorage.credentials.set(PROVIDER_ID, oauth("access-b1", "account-b", undefined, Date.now() + 60 * 60 * 1000));
  await request(retainedModel);
  const withoutEnterprise = attempts.at(-1)!;
  assert(withoutEnterprise.userId === "account-b", "optional enterprise path lost account identity");
  assert(withoutEnterprise.orgId === null, "optional enterprise path fabricated an organization");
  assert(withoutEnterprise.noEnterprise === "1", "optional enterprise path omitted X-No-Enterprise-Id");

  console.log("OK: host ordering, per-retry Headers, refresh identity, and retained-model cross-session A→B");
} finally {
  unregisterOAuthProvider(PROVIDER_ID);
  authStorage.close();
  await rm(temp, { recursive: true, force: true });
}
