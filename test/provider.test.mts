import type { Model, OAuthCredentials } from "@oh-my-pi/pi-ai";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { createWorkBuddyProvider } from "../src/provider.ts";
import { WORKBUDDY_CN, WORKBUDDY_INTL } from "../src/site.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(Object.isFrozen(WORKBUDDY_INTL), "site descriptor root is mutable");
assert(Object.isFrozen(WORKBUDDY_INTL.auth), "site auth descriptor is mutable");
assert(Object.isFrozen(WORKBUDDY_INTL.auth.headers), "site auth headers are mutable");
assert(Object.isFrozen(WORKBUDDY_INTL.catalog.builtin), "site builtin catalog is mutable");
assert(Object.isFrozen(WORKBUDDY_INTL.modelOverrides), "site model overrides are mutable");
assert(Object.isFrozen(WORKBUDDY_INTL.modelOverrides["deepseek-v4.1-flash"]), "site model override is mutable");
assert(Object.isFrozen(WORKBUDDY_INTL.usage), "site usage descriptor is mutable");
assert(
  WORKBUDDY_INTL.providerId === "workbuddy"
    && WORKBUDDY_INTL.label === "WorkBuddy"
    && WORKBUDDY_INTL.chatPath === "/v2/chat/completions"
    && WORKBUDDY_INTL.auth.platform === "CLI"
    && WORKBUDDY_INTL.auth.nonceMode === "query-and-body"
    && WORKBUDDY_INTL.auth.pollIntervalMs === 2_000
    && WORKBUDDY_INTL.auth.pollDeadlineMs === 15 * 60 * 1000
    && WORKBUDDY_INTL.auth.refreshSource === "workbuddy"
    && WORKBUDDY_INTL.auth.refreshBody === "none"
    && WORKBUDDY_INTL.domainPolicy.kind === "fixed",
  "international descriptor changed its frozen protocol contract",
);

assert(Object.isFrozen(WORKBUDDY_CN), "CN site descriptor root is mutable");
assert(
  WORKBUDDY_CN.providerId === "workbuddy-cn"
    && WORKBUDDY_CN.apiOrigin === "https://copilot.tencent.com"
    && WORKBUDDY_CN.chatPath === "/v2/chat/completions"
    && WORKBUDDY_CN.auth.platform === "workbuddy"
    && WORKBUDDY_CN.auth.accountPath === "/v2/plugin/account"
    && WORKBUDDY_CN.auth.refreshSource === "plugin"
    && WORKBUDDY_CN.auth.refreshBody === "empty-json"
    && WORKBUDDY_CN.auth.nonceMode === "none"
    && WORKBUDDY_CN.auth.pollIntervalMs === 1_000
    && WORKBUDDY_CN.auth.pollDeadlineMs === 5 * 60 * 1000
    && WORKBUDDY_CN.auth.pendingCode === 11217
    && WORKBUDDY_CN.domainPolicy.kind === "jwt-issuer"
    && WORKBUDDY_CN.catalog.builtin.length === 0
    && WORKBUDDY_CN.modelOverrides["deepseek-v4.1-flash"] === undefined
    && WORKBUDDY_CN.payload.normalizeNamedToolChoice === false
    && WORKBUDDY_CN.usage.enabled === false,
  "CN descriptor diverged from frozen M0 evidence",
);
assert(
  WORKBUDDY_CN.auth.headers["X-No-User-Id"] === "true"
    && WORKBUDDY_CN.protocolHeaders.Origin === undefined
    && WORKBUDDY_CN.protocolHeaders.Referer === undefined,
  "CN descriptor copied unverified international headers",
);
for (const site of [WORKBUDDY_INTL, WORKBUDDY_CN]) {
  for (const forbidden of ["credential", "scope", "generation", "registry", "session"]) {
    assert(!Object.hasOwn(site, forbidden), `${site.providerId} descriptor captured mutable ${forbidden} state`);
  }
}

const credentials: OAuthCredentials = {
  access: "access-a",
  refresh: "refresh-a",
  expires: Date.now() + 60_000,
  accountId: "account-a",
  orgId: "org-a",
};
let accounts: Array<{
  position: number;
  credentialId: number;
  accountId: string;
  orgId?: string;
  active: boolean;
}> = [{
  position: 0,
  credentialId: 11,
  accountId: "account-a",
  orgId: "org-a",
  active: false,
}];
let getOAuthAccessCalls = 0;
const authStorage = {
  listOAuthAccounts() {
    return accounts;
  },
  async getOAuthAccess() {
    getOAuthAccessCalls += 1;
    return undefined;
  },
};
const controller = createWorkBuddyProvider(WORKBUDDY_INTL);
controller.setModelAccess(new Set(["hy3"]), false);
const config = controller.config([]);
assert(config.baseUrl === "https://www.workbuddy.ai/v2", "provider routing was not fixed to international API");
assert(config.api === "openai-completions", "provider did not use host Chat transport");
assert(config.headers?.Origin === "https://www.workbuddy.ai", "missing fixed Origin");
assert(config.headers?.Referer === "https://www.workbuddy.ai/", "missing fixed Referer");
assert(config.headers?.["X-Domain"] === "www.workbuddy.ai", "missing fixed X-Domain");
assert(config.headers?.["X-Product"] === "SaaS", "missing fixed X-Product");
assert(!Object.keys(config.headers ?? {}).some((name) => name.toLowerCase() === "authorization"), "plugin injected Chat Authorization");
const oauth = config.oauth;
assert(oauth?.getApiKey && oauth.modifyModels, "provider OAuth boundaries are incomplete");


const foreignOpenAI = { provider: "openai", id: "gpt", marker: {} } as unknown as Model;
const foreignAnthropic = { provider: "anthropic", id: "claude", marker: {} } as unknown as Model;
let previousResolverCalls = 0;
let headerGate: Promise<void> | undefined;
let markHeaderStarted: (() => void) | undefined;
const workbuddy = {
  provider: "workbuddy",
  id: "hy3",
  resolveHeaders: async () => {
    previousResolverCalls += 1;
    markHeaderStarted?.();
    await headerGate;
    return { "X-Existing": "preserved", "X-User-Id": "stale" };
  },
} as unknown as Model;
const expiredProjection = oauth.modifyModels([workbuddy], { ...credentials, expires: Date.now() - 1 });
assert(expiredProjection.length === 1, "expired refreshable credential hid the model before host refresh");
const projected = oauth.modifyModels([foreignOpenAI, workbuddy, foreignAnthropic], credentials);
assert(projected[0] === foreignOpenAI && projected[2] === foreignAnthropic, "foreign provider rows changed");
const projectedWorkBuddy = projected[1];
assert(projectedWorkBuddy?.provider === "workbuddy" && projectedWorkBuddy.resolveHeaders, "WorkBuddy resolver was not installed");
controller.bindContext({
  modelRegistry: { authStorage },
  sessionManager: { getSessionId: () => "session-a" },
} as unknown as ExtensionContext);
assert(oauth.getApiKey(credentials) === "access-a", "getApiKey did not return validated host access");
const headers = await projectedWorkBuddy.resolveHeaders();
assert(previousResolverCalls === 1, "existing resolver was not composed exactly once");
assert(headers?.["X-Existing"] === "preserved", "existing resolver headers were lost");
assert(headers?.["X-User-Id"] === "account-a" && headers["X-Enterprise-Id"] === "org-a", "request identity headers mismatch");
assert(getOAuthAccessCalls === 0, "resolveHeaders performed a redundant OAuth access resolution");
let releaseSessionHeaders!: () => void;
headerGate = new Promise<void>((resolve) => { releaseSessionHeaders = resolve; });
const sessionHeadersStarted = new Promise<void>((resolve) => { markHeaderStarted = resolve; });
const inFlightSessionResolution = projectedWorkBuddy.resolveHeaders();
await sessionHeadersStarted;
controller.bindContext({
  modelRegistry: { authStorage },
  sessionManager: { getSessionId: () => "session-b" },
} as unknown as ExtensionContext);
releaseSessionHeaders();
const crossSessionHeaders = await inFlightSessionResolution;
assert(
  crossSessionHeaders?.["X-User-Id"] === "account-a",
  "a second session sharing AuthStorage clobbered the in-flight binding",
);
headerGate = undefined;

let releaseAccountRace!: () => void;
headerGate = new Promise<void>((resolve) => { releaseAccountRace = resolve; });
const accountRaceStarted = new Promise<void>((resolve) => { markHeaderStarted = resolve; });
const inFlightAccountA = projectedWorkBuddy.resolveHeaders();
await accountRaceStarted;
accounts = [{ position: 0, credentialId: 21, accountId: "account-b", orgId: "org-b", active: true }];
const concurrentAccountB = projectedWorkBuddy.resolveHeaders();
releaseAccountRace();
const accountBHeaders = await concurrentAccountB;
assert(
  accountBHeaders?.["X-User-Id"] === "account-b" && accountBHeaders["X-Enterprise-Id"] === "org-b",
  "concurrent B request did not retain its selected durable row",
);
let accountRaceRejected = false;
try {
  await inFlightAccountA;
} catch (error) {
  accountRaceRejected = error instanceof Error && error.message.includes("stored account changed");
}
assert(accountRaceRejected, "A Header resolution survived a concurrent stored-account switch");
accounts = [{ position: 0, credentialId: 11, accountId: "account-a", orgId: "org-a", active: true }];
headerGate = undefined;
markHeaderStarted = undefined;
const resolverCallsBeforeScopeChecks = previousResolverCalls;
controller.setModelAccess(new Set(["hy3"]), true);
let transitionRejected = false;
try {
  await projectedWorkBuddy.resolveHeaders();
} catch (error) {
  transitionRejected = error instanceof Error && error.message.includes("scope is changing");
}
assert(transitionRejected, "scope transition did not fail closed at the resolver");
assert(previousResolverCalls === resolverCallsBeforeScopeChecks, "scope transition reached the previous resolver");

controller.setModelAccess(new Set(), false);
let removedModelRejected = false;
try {
  await projectedWorkBuddy.resolveHeaders();
} catch (error) {
  removedModelRejected = error instanceof Error && error.message.includes("outside the active scope");
}
assert(removedModelRejected, "removed model did not fail closed at the resolver");
assert(previousResolverCalls === resolverCallsBeforeScopeChecks, "removed model reached the previous resolver");
controller.setModelAccess(new Set(["hy3"]), false);
let releaseHeaders!: () => void;
headerGate = new Promise<void>((resolve) => { releaseHeaders = resolve; });
const headersStarted = new Promise<void>((resolve) => { markHeaderStarted = resolve; });
const inFlightResolution = projectedWorkBuddy.resolveHeaders();
await headersStarted;
controller.setModelAccess(new Set(["hy3"]), true);
releaseHeaders();
let midFlightTransitionRejected = false;
try {
  await inFlightResolution;
} catch (error) {
  midFlightTransitionRejected = error instanceof Error && error.message.includes("scope is changing");
}
assert(midFlightTransitionRejected, "scope transition during header resolution did not fail closed");
headerGate = undefined;
markHeaderStarted = undefined;
controller.setModelAccess(new Set(["hy3"]), false);


accounts = [{ position: 0, credentialId: 21, accountId: "account-b", orgId: "org-b", active: true }];
controller.bindContext({
  modelRegistry: { authStorage },
  sessionManager: { getSessionId: () => "session-b" },
} as unknown as ExtensionContext);
const switchedHeaders = await projectedWorkBuddy.resolveHeaders();
assert(
  switchedHeaders?.["X-User-Id"] === "account-b" && switchedHeaders["X-Enterprise-Id"] === "org-b",
  "retained resolver captured the projection-time binding",
);

const childController = createWorkBuddyProvider(WORKBUDDY_INTL);
childController.setModelAccess(new Set(["hy3"]), false);
childController.bindContext({
  modelRegistry: { authStorage },
  sessionManager: { getSessionId: () => "subagent-b" },
} as unknown as ExtensionContext);
const childOAuth = childController.config([]).oauth;
const childCredentials: OAuthCredentials = {
  access: "access-b",
  refresh: "refresh-b",
  expires: Date.now() + 60_000,
  accountId: "account-b",
  orgId: "org-b",
};
const childModel = childOAuth?.modifyModels?.([workbuddy], childCredentials)[0];
assert(childModel?.resolveHeaders, "fresh subagent controller did not project a resolver");
const childHeaders = await childModel.resolveHeaders();
assert(
  childHeaders?.["X-User-Id"] === "account-b" && childHeaders["X-Enterprise-Id"] === "org-b",
  "fresh subagent controller did not resolve account B",
);

accounts = [{ position: 0, credentialId: 11, accountId: "account-a", orgId: "org-a", active: true }];
controller.bindContext({
  modelRegistry: { authStorage },
  sessionManager: { getSessionId: () => "session-a" },
} as unknown as ExtensionContext);

accounts = [
  { position: 0, credentialId: 11, accountId: "account-a", orgId: "org-a", active: true },
  { position: 1, credentialId: 12, accountId: "account-b", orgId: "org-b", active: false },
];
const ambiguous = oauth.modifyModels([foreignOpenAI, workbuddy, foreignAnthropic], credentials);
assert(ambiguous.length === 2 && ambiguous[0] === foreignOpenAI && ambiguous[1] === foreignAnthropic, "ambiguous account did not hide only WorkBuddy rows");
let ambiguousKeyRejected = false;
try {
  oauth.getApiKey(credentials);
} catch (error) {
  ambiguousKeyRejected = error instanceof Error && error.message.includes("found 2");
}
assert(ambiguousKeyRejected, "getApiKey accepted multiple stored accounts");
let ambiguousHeadersRejected = false;
try {
  await projectedWorkBuddy.resolveHeaders();
} catch (error) {
  ambiguousHeadersRejected = error instanceof Error && error.message.includes("found 2");
}
assert(ambiguousHeadersRejected, "resolveHeaders accepted multiple stored accounts");

accounts = [{ position: 0, credentialId: 21, accountId: "account-b", orgId: "org-b", active: true }];
let mismatchedKeyRejected = false;
try {
  oauth.getApiKey(credentials);
} catch (error) {
  mismatchedKeyRejected = error instanceof Error && error.message.includes("does not match");
}
assert(mismatchedKeyRejected, "getApiKey accepted a credential for a different stored account");

accounts = [{ position: 0, credentialId: 11, accountId: "account-a", orgId: "org-a", active: true }];
const activeStillOne = oauth.modifyModels([workbuddy], credentials);
assert(activeStillOne.length === 1, "active sticky marker was incorrectly counted as another account");

const noOrgCredentials = { ...credentials, orgId: undefined };
for (const storedOrgId of [undefined, "", "   "]) {
  accounts = [{ position: 0, credentialId: 11, accountId: "account-a", orgId: storedOrgId, active: true }];
  assert(oauth.modifyModels([foreignOpenAI, workbuddy], noOrgCredentials).length === 2, "optional enterprise identity hid WorkBuddy model");
  assert(oauth.getApiKey(noOrgCredentials) === "access-a", "getApiKey rejected optional enterprise identity");
  const noOrgModel = oauth.modifyModels([workbuddy], noOrgCredentials)[0];
  const noOrgHeaders = await noOrgModel?.resolveHeaders?.();
  assert(noOrgHeaders?.["X-Enterprise-Id"] === undefined, `request sent empty enterprise identity for ${JSON.stringify(storedOrgId)}`);
  assert(noOrgHeaders?.["X-No-Enterprise-Id"] === "1", `request omitted no-enterprise marker for ${JSON.stringify(storedOrgId)}`);
}

accounts = [];
let requestBoundaryRejected = false;
try {
  await projectedWorkBuddy.resolveHeaders();
} catch (error) {
  requestBoundaryRejected = error instanceof Error && error.message.includes("found 0");
}
assert(requestBoundaryRejected, "retained WorkBuddy model bypassed request-boundary account guard");
assert(getOAuthAccessCalls === 0, "provider header resolution called AuthStorage.getOAuthAccess");


const cnAccess = `x.${Buffer.from(JSON.stringify({ iss: "https://copilot.tencent.com" })).toString("base64url")}.y`;
const cnCredentials: OAuthCredentials = {
  access: cnAccess,
  refresh: "refresh-cn",
  expires: Date.now() + 60_000,
  accountId: "account-cn",
};
const cnAccounts = [{ position: 0, credentialId: 31, accountId: "account-cn", active: true }];
const cnController = createWorkBuddyProvider(WORKBUDDY_CN);
cnController.setModelAccess(new Set(["hy3"]), false);
cnController.bindContext({
  modelRegistry: {
    authStorage: {
      listOAuthAccounts: (providerId: string) => providerId === "workbuddy-cn" ? cnAccounts : [],
      async remove() {},
    },
  },
} as unknown as ExtensionContext);
const cnConfig = cnController.config([]);
assert(cnConfig.baseUrl === "https://copilot.tencent.com/v2", "CN provider routed outside its evidence-bound endpoint");
assert(cnConfig.usage === undefined, "CN provider registered unverified Usage");
assert(cnConfig.headers?.["X-Domain"] === undefined, "CN provider froze a credential-derived domain");
assert(cnConfig.headers?.Origin === undefined && cnConfig.headers?.Referer === undefined, "CN provider copied unverified browser headers");
const cnModel = {
  provider: "workbuddy-cn",
  id: "hy3",
} as unknown as Model;
const projectedCn = cnConfig.oauth?.modifyModels?.([cnModel], cnCredentials)[0];
assert(projectedCn?.resolveHeaders, "CN model did not receive a request-bound identity resolver");
assert(cnConfig.oauth?.getApiKey?.(cnCredentials) === cnAccess, "CN persisted credential was not accepted");
const cnHeaders = await projectedCn.resolveHeaders();
assert(
  cnHeaders?.["X-User-Id"] === "account-cn"
    && cnHeaders["X-No-Enterprise-Id"] === "1"
    && cnHeaders["X-Domain"] === "copilot.tencent.com",
  "CN request identity or issuer-derived domain was not bound to its credential",
);
const unsafeCn = { ...cnCredentials, access: "not-a-jwt" };
assert(
  cnConfig.oauth?.modifyModels?.([cnModel], unsafeCn).length === 0,
  "CN credential without a reconstructable domain remained requestable",
);
cnController.shutdown();

let shutdownFetchStarted = false;
const shutdownController = createWorkBuddyProvider(WORKBUDDY_INTL, async (_input, init) => {
  shutdownFetchStarted = true;
  return new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
});
const shutdownLogin = shutdownController.config([]).oauth!.login({
  onAuth() {},
  async onPrompt() { return ""; },
});
await Promise.resolve();
assert(shutdownFetchStarted, "extension-shutdown login request did not start");
shutdownController.shutdown();
let shutdownCancelled = false;
try {
  await shutdownLogin;
} catch (error) {
  shutdownCancelled = error instanceof Error && error.name === "LoginCancelledError";
}
assert(shutdownCancelled, "extension shutdown did not cancel OAuth network work");
console.log("OK: provider headers, isolation, resolver composition, and single-account fail-closed");
