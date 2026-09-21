import { LoginCancelledError } from "@oh-my-pi/pi-ai/error";
import type { OAuthCredentials } from "@oh-my-pi/pi-ai";
import {
  credentialFromLoginResponse,
  oauthFromWorkBuddy,
  refreshWorkBuddyOAuth,
} from "../src/auth.ts";
import { WORKBUDDY_INTL } from "../src/site.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function complete(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    accessToken: "access-a",
    refreshToken: "refresh-a",
    expiresIn: 3600,
    uid: "account-a",
    enterpriseId: "org-a",
    ...overrides,
  };
}

const CN_SITE = {
  ...WORKBUDDY_INTL,
  providerId: "workbuddy-cn",
  label: "WorkBuddy CN",
  commandName: "workbuddy-cn",
};

let realmMessage = "";
try {
  credentialFromLoginResponse(CN_SITE, complete({ accessToken: undefined }), 1_000);
} catch (error) {
  realmMessage = error instanceof Error ? error.message : "";
}
assert(
  realmMessage.startsWith("workbuddy-cn credential")
    && realmMessage.includes("/login workbuddy-cn")
    && !realmMessage.includes("/login workbuddy again"),
  `credential error leaked the international realm: ${realmMessage}`,
);


const required = ["accessToken", "refreshToken", "expiresIn", "uid"] as const;
for (const field of required) {
  const data = complete();
  delete data[field];
  let rejected = false;
  try {
    credentialFromLoginResponse(WORKBUDDY_INTL, data, 1_000);
  } catch {
    rejected = true;
  }
  assert(rejected, `missing ${field} was accepted`);
}

const jwtAccess = `x.${Buffer.from(JSON.stringify({ sub: "jwt-account-a" })).toString("base64url")}.y`;
const jwtIdentity = credentialFromLoginResponse(WORKBUDDY_INTL, complete({
  accessToken: jwtAccess,
  uid: undefined,
}), 1_000);
assert(jwtIdentity.uid === "jwt-account-a", "access-token JWT sub was not accepted as durable uid");
const liveShape = oauthFromWorkBuddy(credentialFromLoginResponse(WORKBUDDY_INTL, complete({
  accessToken: jwtAccess,
  uid: undefined,
  enterpriseId: undefined,
}), 1_000));
assert(liveShape.accountId === "jwt-account-a", "live Plugin Auth subject was not mapped");
assert(liveShape.orgId === undefined, "missing optional enterprise identity was fabricated");
const jwtEnterpriseAccess = `x.${Buffer.from(JSON.stringify({
  sub: "jwt-account-a",
  enterpriseId: "unproven-jwt-org",
  enterprise_id: "unproven-jwt-org-snake",
})).toString("base64url")}.y`;
const jwtEnterpriseIdentity = credentialFromLoginResponse(WORKBUDDY_INTL, complete({
  accessToken: jwtEnterpriseAccess,
  uid: undefined,
  enterpriseId: undefined,
  enterprise_id: undefined,
}), 1_000);
assert(jwtEnterpriseIdentity.enterpriseId === undefined, "unproven JWT enterprise claim was accepted");

let emailClaimRejected = false;
try {
  credentialFromLoginResponse(WORKBUDDY_INTL, complete({
    accessToken: `x.${Buffer.from(JSON.stringify({ email: "display@example.com" })).toString("base64url")}.y`,
    uid: undefined,
  }), 1_000);
} catch {
  emailClaimRejected = true;
}
assert(emailClaimRejected, "email-only access-token claim was treated as durable uid");

for (const expiresIn of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  let rejected = false;
  try {
    credentialFromLoginResponse(WORKBUDDY_INTL, complete({ expiresIn }), 1_000);
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("expiry");
  }
  assert(rejected, `invalid expiresIn ${expiresIn} was accepted`);
}

const mapped = oauthFromWorkBuddy(credentialFromLoginResponse(WORKBUDDY_INTL, complete({
  email: "real@example.com",
  nickname: "Display Name",
  domain: "attacker.invalid",
}), 1_000));
assert(mapped.access === "access-a" && mapped.refresh === "refresh-a", "tokens were not mapped");
assert(mapped.expires === 3_601_000, `expiry was not mapped: ${mapped.expires}`);
assert(mapped.accountId === "account-a" && mapped.orgId === "org-a", "identity was not mapped");
assert(mapped.email === "real@example.com", "explicit email was not preserved");
assert(!("nickname" in mapped) && !("domain" in mapped), "display/routing data polluted OAuth identity");

const nicknameOnly = oauthFromWorkBuddy(credentialFromLoginResponse(WORKBUDDY_INTL, complete({ nickname: "looks@example.com" }), 1_000));
assert(nicknameOnly.email === undefined, "nickname was aliased to email");
const malformedEmail = oauthFromWorkBuddy(credentialFromLoginResponse(WORKBUDDY_INTL, complete({ email: "not-an-email" }), 1_000));
assert(malformedEmail.email === undefined, "malformed email was persisted");

const previous: OAuthCredentials = {
  access: "expired-a",
  refresh: "refresh-a",
  expires: 1,
  accountId: "account-a",
  orgId: "org-a",
  email: "real@example.com",
};
let refreshRequest: RequestInit | undefined;
const successfulRefresh: typeof fetch = async (_input, init) => {
  refreshRequest = init;
  return Response.json({
    code: 0,
    data: {
      accessToken: "access-a2",
      refreshToken: "refresh-a2",
      expiresIn: 7200,
      uid: "account-a",
      enterpriseId: "org-a",
    },
  });
};
const refreshed = await refreshWorkBuddyOAuth(WORKBUDDY_INTL, previous, successfulRefresh, 10_000);
assert(refreshed.access === "access-a2" && refreshed.refresh === "refresh-a2", "refresh tokens were not replaced");
assert(refreshed.expires === 7_210_000, "refresh expiry was not replaced");
assert(refreshed.accountId === previous.accountId && refreshed.orgId === previous.orgId, "refresh lost identity");
assert(refreshed.email === previous.email, "refresh lost verified email");
const refreshHeaders = new Headers(refreshRequest?.headers);
assert(refreshHeaders.get("x-refresh-token") === "refresh-a", "refresh did not use host credential input");
assert(refreshHeaders.get("x-enterprise-id") === "org-a", "refresh did not use host enterprise identity");

const omittedRefreshFields: typeof fetch = async () => Response.json({
  code: 0,
  data: {
    accessToken: "access-a3",
    expiresIn: 1800,
  },
});
const preserved = await refreshWorkBuddyOAuth(WORKBUDDY_INTL, previous, omittedRefreshFields, 10_000);
assert(preserved.refresh === previous.refresh, "omitted refresh token did not preserve the host credential");
assert(
  preserved.accountId === previous.accountId && preserved.orgId === previous.orgId,
  "omitted response identity did not preserve the durable account identity",
);

for (const responseData of [
  complete({ accessToken: "", uid: undefined, enterpriseId: undefined }),
  complete({ expiresIn: 0, uid: undefined, enterpriseId: undefined }),
  complete({ accessToken: "access-x", refreshToken: "refresh-x", uid: "account-b", enterpriseId: "org-a" }),
  complete({ accessToken: "access-x", refreshToken: "refresh-x", uid: "account-a", enterpriseId: "org-b" }),
]) {
  let rejected = false;
  const fetcher: typeof fetch = async () => Response.json({ code: 0, data: responseData });
  try {
    await refreshWorkBuddyOAuth(WORKBUDDY_INTL, previous, fetcher, 10_000);
  } catch {
    rejected = true;
  }
  assert(rejected, `invalid refresh response was accepted: ${JSON.stringify(responseData)}`);
}

let missingAccountRejected = false;
try {
  await refreshWorkBuddyOAuth(WORKBUDDY_INTL, { ...previous, accountId: undefined }, successfulRefresh, 10_000);
} catch {
  missingAccountRejected = true;
}
assert(missingAccountRejected, "refresh input without account identity was accepted");

let noEnterpriseRequest: RequestInit | undefined;
const noEnterpriseRefresh: typeof fetch = async (_input, init) => {
  noEnterpriseRequest = init;
  return Response.json({ code: 0, data: { accessToken: "access-a4", expiresIn: 1800 } });
};
const noEnterprise = await refreshWorkBuddyOAuth(WORKBUDDY_INTL, { ...previous, orgId: undefined }, noEnterpriseRefresh, 10_000);
assert(noEnterprise.orgId === undefined, "refresh fabricated an enterprise identity");
const noEnterpriseHeaders = new Headers(noEnterpriseRequest?.headers);
assert(noEnterpriseHeaders.get("x-enterprise-id") === null, "refresh sent a fabricated enterprise header");
assert(noEnterpriseHeaders.get("x-no-enterprise-id") === null, "refresh sent a Chat-only no-enterprise marker");

const refreshAbort = new AbortController();
const hangingRefresh: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
  const signal = init?.signal;
  if (!signal) {
    reject(new Error("refresh request did not receive an AbortSignal"));
    return;
  }
  if (signal.aborted) {
    reject(signal.reason);
    return;
  }
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});
const pendingRefresh = refreshWorkBuddyOAuth(WORKBUDDY_INTL, previous, hangingRefresh, 10_000, refreshAbort.signal);
await Promise.resolve();
refreshAbort.abort("host refresh cancelled");
let refreshCancelled = false;
try {
  await pendingRefresh;
} catch (error) {
  refreshCancelled = error instanceof LoginCancelledError;
}
assert(refreshCancelled, "refresh cancellation did not surface as host LoginCancelledError");

console.log("OK: login mapping and refresh boundaries reject incomplete or conflicting identity");
