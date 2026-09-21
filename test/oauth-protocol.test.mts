import { LoginCancelledError } from "@oh-my-pi/pi-ai/error";
import {
  pollPluginToken,
  refreshPluginToken,
  startPluginLogin,
  WorkBuddyOAuthError,
  type WorkBuddyOAuthErrorKind,
} from "../src/workbuddy-api.ts";
import { WORKBUDDY_INTL } from "../src/site.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectKind(promise: Promise<unknown>, kind: WorkBuddyOAuthErrorKind): Promise<WorkBuddyOAuthError> {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof WorkBuddyOAuthError, `expected WorkBuddyOAuthError, got ${String(error)}`);
    assert(error.kind === kind, `expected ${kind}, got ${error.kind}`);
    return error;
  }
  throw new Error(`expected ${kind} rejection`);
}

async function expectCancelled(promise: Promise<unknown>): Promise<LoginCancelledError> {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof LoginCancelledError, `expected LoginCancelledError, got ${String(error)}`);
    return error;
  }
  throw new Error("expected cancellation rejection");
}

const CN_SITE = {
  ...WORKBUDDY_INTL,
  providerId: "workbuddy-cn",
  label: "WorkBuddy CN",
  commandName: "workbuddy-cn",
};
const realmError = await expectKind(
  refreshPluginToken(CN_SITE, "refresh", undefined, async () => new Response(null, { status: 401 })),
  "token_refresh",
);
assert(
  realmError.message.startsWith("WorkBuddy CN token refresh")
    && realmError.message.includes("/login workbuddy-cn"),
  `OAuth error leaked the international realm: ${realmError.message}`,
);

await expectKind(
  pollPluginToken(WORKBUDDY_INTL, "state", async () => new Response("{", {
    headers: { "Content-Type": "application/json" },
  }), { deadlineMs: 100 }),
  "invalid_response",
);
await expectKind(
  pollPluginToken(WORKBUDDY_INTL, "state", async () => Response.json({}), { deadlineMs: 100 }),
  "invalid_response",
);
await expectKind(
  pollPluginToken(WORKBUDDY_INTL, "state", async () => Response.json({ code: 0, data: [] }), { deadlineMs: 100 }),
  "invalid_response",
);
const pending = () => Response.json({ code: 11217 });
const success = () => Response.json({ code: 0, data: { accessToken: "access", refreshToken: "refresh", expiresIn: 3600, uid: "account", enterpriseId: "org" } });

let calls = 0;
let observedPollInput: RequestInfo | URL | undefined;
let observedPollInit: RequestInit | undefined;
const pendingThenSuccess: typeof fetch = async (input, init) => {
  calls += 1;
  observedPollInput ??= input;
  observedPollInit ??= init;
  return calls === 1 ? pending() : success();
};
const completed = await pollPluginToken(WORKBUDDY_INTL, "state", pendingThenSuccess, { pollIntervalMs: 1, deadlineMs: 100 });
assert(completed.accessToken === "access" && calls === 2, "pending authorization did not continue once");
assert(
  String(observedPollInput) === "https://www.workbuddy.ai/v2/plugin/auth/token?state=state",
  "international token polling route changed",
);
assert(new Headers(observedPollInit?.headers).get("x-no-authorization") === "true", "poll lost Plugin Auth headers");

calls = 0;
const delayAbort = new AbortController();
const delayed = pollPluginToken(WORKBUDDY_INTL, "state", async () => {
  calls += 1;
  return pending();
}, { signal: delayAbort.signal, pollIntervalMs: 1_000, deadlineMs: 5_000 });
await new Promise((resolve) => setTimeout(resolve, 5));
delayAbort.abort("user cancelled");
await expectCancelled(delayed);
await new Promise((resolve) => setTimeout(resolve, 10));
assert(calls === 1, `cancelled poll issued ${calls} requests`);

const requestAbort = new AbortController();
let releaseRequest!: (response: Response) => void;
const lateRequest = pollPluginToken(WORKBUDDY_INTL, "state", () => new Promise<Response>((resolve) => {
  releaseRequest = resolve;
}), { signal: requestAbort.signal, deadlineMs: 5_000 });
await Promise.resolve();
requestAbort.abort("session aborted");
releaseRequest(success());
await expectCancelled(lateRequest);

await expectKind(
  pollPluginToken(WORKBUDDY_INTL, "state", async () => pending(), { pollIntervalMs: 20, deadlineMs: 5 }),
  "poll_timeout",
);

calls = 0;
await expectKind(pollPluginToken(WORKBUDDY_INTL, "state", async () => {
  calls += 1;
  return Response.json({ code: 40001, msg: "denied" });
}, { deadlineMs: 100 }), "authorization_rejected");
assert(calls === 1, "authorization rejection was retried");

calls = 0;
await expectKind(pollPluginToken(WORKBUDDY_INTL, "state", async () => {
  calls += 1;
  throw new TypeError("offline");
}, { deadlineMs: 100 }), "network_failure");
assert(calls === 1, "network failure was retried");

calls = 0;
const serverError = await expectKind(pollPluginToken(WORKBUDDY_INTL, "state", async () => {
  calls += 1;
  return new Response(null, { status: 503 });
}, { deadlineMs: 100 }), "server_failure");
assert(serverError.status === 503 && calls === 1, "5xx classification or retry boundary is wrong");

calls = 0;
const rateLimitedThenSuccess: typeof fetch = async () => {
  calls += 1;
  return calls === 1
    ? new Response(null, { status: 429, headers: { "Retry-After": "0" } })
    : success();
};
await pollPluginToken(WORKBUDDY_INTL, "state", rateLimitedThenSuccess, { deadlineMs: 100 });
assert(calls === 2, "valid Retry-After was not honored");

const rateAbort = new AbortController();
calls = 0;
const rateWait = pollPluginToken(WORKBUDDY_INTL, "state", async () => {
  calls += 1;
  return new Response(null, { status: 429, headers: { "Retry-After": "5" } });
}, { signal: rateAbort.signal, deadlineMs: 10_000 });
await new Promise((resolve) => setTimeout(resolve, 5));
rateAbort.abort("extension shutdown");
await expectCancelled(rateWait);
assert(calls === 1, "cancelled Retry-After wait issued another request");

for (const authUrl of [
  "https://example.invalid/login",
  "https://user:pass@www.workbuddy.ai/login",
  "http://www.workbuddy.ai/login",
  "https://www.workbuddy.ai.evil.example/login",
]) {
  await expectKind(startPluginLogin(WORKBUDDY_INTL, async () => Response.json({
    code: 0,
    data: { state: "state", authUrl },
  })), "invalid_response");
}
let observedStartInput: RequestInfo | URL | undefined;
let observedStartInit: RequestInit | undefined;
const trustedStart = await startPluginLogin(WORKBUDDY_INTL, async (input, init) => {
  observedStartInput = input;
  observedStartInit = init;
  return Response.json({
    code: 0,
    data: { state: "state", authUrl: "https://www.workbuddy.ai/login?platform=CLI" },
  });
});
assert(trustedStart.state === "state", "official WorkBuddy login URL was rejected");
const observedStartUrl = new URL(String(observedStartInput));
const observedNonce = observedStartUrl.searchParams.get("nonce");
const observedStartBody = JSON.parse(String(observedStartInit?.body)) as { nonce?: string };
assert(
  observedStartUrl.origin === "https://www.workbuddy.ai"
    && observedStartUrl.pathname === "/v2/plugin/auth/state"
    && observedStartUrl.searchParams.get("platform") === "CLI"
    && observedNonce?.length === 32
    && observedStartBody.nonce === observedNonce,
  "international login-start URL, platform, or query/body nonce changed",
);
const observedStartHeaders = new Headers(observedStartInit?.headers);
assert(
  observedStartHeaders.get("origin") === "https://www.workbuddy.ai"
    && observedStartHeaders.get("referer") === "https://www.workbuddy.ai/"
    && observedStartHeaders.get("x-no-authorization") === "true"
    && observedStartHeaders.get("x-no-user-id") === "1",
  "international login-start protocol headers changed",
);

calls = 0;
const loginStartRateError = await expectKind(startPluginLogin(WORKBUDDY_INTL, async () => {
  calls += 1;
  return new Response(null, { status: 429, headers: { "Retry-After": "0" } });
}), "rate_limited");
assert(loginStartRateError.status === 429 && calls === 1, "login-start rate limit was generically retried");

calls = 0;
const rateError = await expectKind(refreshPluginToken(WORKBUDDY_INTL, "refresh", "org", async () => {
  calls += 1;
  return new Response(null, { status: 429 });
}), "rate_limited");
assert(rateError.status === 429 && calls === 1, "refresh rate limit was generically retried");

console.log("OK: OAuth cancellation, timeout, rejection, network, 5xx, and Retry-After boundaries");
