import { LoginCancelledError } from "@oh-my-pi/pi-ai/error";
import type { OAuthCredentials } from "@oh-my-pi/pi-ai";
import {
  credentialDomain,
  credentialFromLoginResponse,
  loginWorkBuddy,
  oauthFromWorkBuddy,
  refreshWorkBuddyOAuth,
} from "../src/auth.ts";
import { WORKBUDDY_CN, WORKBUDDY_INTL } from "../src/site.ts";

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

const CN_SITE = WORKBUDDY_CN;

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
assert(refreshRequest?.body === undefined, "international refresh unexpectedly gained a request body");

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
for (const orgId of [undefined, "", "   "]) {
  const noEnterprise = await refreshWorkBuddyOAuth(WORKBUDDY_INTL, { ...previous, orgId }, noEnterpriseRefresh, 10_000);
  assert(noEnterprise.orgId === undefined, `refresh preserved empty enterprise identity ${JSON.stringify(orgId)}`);
  const noEnterpriseHeaders = new Headers(noEnterpriseRequest?.headers);
  assert(noEnterpriseHeaders.get("x-enterprise-id") === null, `refresh sent empty enterprise header ${JSON.stringify(orgId)}`);
  assert(noEnterpriseHeaders.get("x-no-enterprise-id") === null, "refresh sent a Chat-only no-enterprise marker");
}

const cnJwt = (issuer: string) => `x.${Buffer.from(JSON.stringify({ iss: issuer })).toString("base64url")}.y`;
assert(
  credentialDomain(WORKBUDDY_CN, cnJwt("https://copilot.tencent.com")) === "copilot.tencent.com",
  "CN domain was not reconstructed from the persisted access token issuer",
);
for (const issuer of ["", "http://copilot.tencent.com", "https://user@copilot.tencent.com", "https://copilot.tencent.com:8443"]) {
  let unsafeIssuerRejected = false;
  try {
    credentialDomain(WORKBUDDY_CN, cnJwt(issuer));
  } catch {
    unsafeIssuerRejected = true;
  }
  assert(unsafeIssuerRejected, `unsafe CN issuer was accepted: ${issuer}`);
}

const cnLoginRequests: Array<{ url: string; init?: RequestInit }> = [];
const cnLogin = await loginWorkBuddy(WORKBUDDY_CN, {
  onAuth() {},
  async onPrompt() { return ""; },
}, async (input, init) => {
  const url = String(input);
  cnLoginRequests.push({ url, init });
  if (url.includes("/auth/state")) {
    return Response.json({
      code: 0,
      data: { state: "cn-state", authUrl: "https://www.workbuddy.cn/login?platform=workbuddy" },
    });
  }
  if (url.includes("/auth/token?")) {
    return Response.json({
      code: 0,
      data: {
        accessToken: cnJwt("https://copilot.tencent.com"),
        refreshToken: "refresh-cn",
        expiresIn: 3600,
        domain: "copilot.tencent.com",
      },
    });
  }
  assert(url.endsWith("/v2/plugin/account"), `CN login called an unexpected endpoint: ${url}`);
  const headers = new Headers(init?.headers);
  assert(headers.get("authorization")?.startsWith("Bearer "), "CN account finalize omitted bearer auth");
  assert(headers.get("x-domain") === "copilot.tencent.com", "CN account finalize omitted verified domain");
  return Response.json({ code: 0, data: { uid: "account-cn" } });
}, () => 1_000);
assert(
  cnLogin.accountId === "account-cn"
    && cnLogin.orgId === undefined
    && cnLoginRequests.length === 3,
  "CN login persisted before durable account finalize",
);

let missingCnUidRejected = false;
try {
  await loginWorkBuddy(WORKBUDDY_CN, {
    onAuth() {},
    async onPrompt() { return ""; },
  }, async (input) => {
    const url = String(input);
    if (url.includes("/auth/state")) {
      return Response.json({ code: 0, data: { state: "cn-state", authUrl: "https://copilot.tencent.com/login" } });
    }
    if (url.includes("/auth/token?")) {
      return Response.json({
        code: 0,
        data: {
          accessToken: cnJwt("https://copilot.tencent.com"),
          refreshToken: "refresh-cn",
          expiresIn: 3600,
          domain: "copilot.tencent.com",
        },
      });
    }
    return Response.json({ code: 0, data: {} });
  }, () => 1_000);
} catch {
  missingCnUidRejected = true;
}
assert(missingCnUidRejected, "CN login accepted a token bundle without finalized account uid");

let cnRefreshRequest: RequestInit | undefined;
const cnPrevious: OAuthCredentials = {
  access: cnJwt("https://copilot.tencent.com"),
  refresh: "refresh-cn",
  expires: 1,
  accountId: "account-cn",
};
const cnRefreshed = await refreshWorkBuddyOAuth(WORKBUDDY_CN, cnPrevious, async (_input, init) => {
  cnRefreshRequest = init;
  return Response.json({
    code: 0,
    data: {
      accessToken: cnJwt("https://copilot.tencent.com"),
      refreshToken: "refresh-cn-2",
      expiresIn: 3600,
      domain: "copilot.tencent.com",
    },
  });
}, 2_000);
assert(cnRefreshed.accountId === "account-cn", "CN refresh lost finalized durable uid");
assert(
  new Headers(cnRefreshRequest?.headers).get("x-domain") === "copilot.tencent.com"
    && cnRefreshRequest?.body === "{}",
  "CN refresh did not use its reconstructed domain and empty JSON body",
);

let changedCnDomainRejected = false;
try {
  await refreshWorkBuddyOAuth(WORKBUDDY_CN, cnPrevious, async () => Response.json({
    code: 0,
    data: {
      accessToken: cnJwt("https://other.example"),
      refreshToken: "refresh-cn-2",
      expiresIn: 3600,
      domain: "other.example",
    },
  }), 2_000);
} catch {
  changedCnDomainRejected = true;
}
assert(changedCnDomainRejected, "CN refresh accepted a changed credential domain");

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
