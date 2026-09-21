import { LoginCancelledError } from "@oh-my-pi/pi-ai/error";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@oh-my-pi/pi-ai";
import {
  fetchPluginAccount,
  pollPluginToken,
  refreshPluginToken,
  startPluginLogin,
} from "./workbuddy-api.ts";
import type { SiteDescriptor } from "./site.ts";

export interface WorkBuddyCredential {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  uid: string;
  enterpriseId?: string;
  email?: string;
  nickname?: string;
}

type JsonRecord = Record<string, unknown>;
type Fetch = typeof globalThis.fetch;

function requiredString(site: SiteDescriptor, value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${site.providerId} credential is missing ${field}; run /login ${site.commandName} again`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function expiryFromResponse(site: SiteDescriptor, value: unknown, now: number): number {
  const message = `${site.providerId} credential has invalid expiry; run /login ${site.commandName} again`;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(message);
  }
  const expiresAtMs = now + value * 1000;
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now) {
    throw new Error(message);
  }
  return expiresAtMs;
}

function explicitEmail(value: unknown): string | undefined {
  const email = optionalString(value);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : undefined;
}

function jwtPayload(token: unknown): JsonRecord {
  if (typeof token !== "string") return {};
  const payload = token.split(".")[1];
  if (!payload) return {};
  try {
    const padded = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed: unknown = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : {};
  } catch {
    return {};
  }
}

function issuerHostname(site: SiteDescriptor, accessToken: string): string {
  const issuer = optionalString(jwtPayload(accessToken).iss);
  if (!issuer) {
    throw new Error(`${site.providerId} credential cannot reconstruct domain from access-token issuer; run /login ${site.commandName} again`);
  }
  let parsed: URL;
  try {
    parsed = new URL(issuer);
  } catch {
    throw new Error(`${site.providerId} credential has an invalid access-token issuer; run /login ${site.commandName} again`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !parsed.hostname) {
    throw new Error(`${site.providerId} credential has an unsafe access-token issuer; run /login ${site.commandName} again`);
  }
  return parsed.hostname.toLowerCase();
}

export function credentialDomain(site: SiteDescriptor, accessToken: string): string {
  return site.domainPolicy.kind === "fixed"
    ? site.domainPolicy.value
    : issuerHostname(site, accessToken);
}

function verifiedResponseDomain(site: SiteDescriptor, data: JsonRecord, accessToken: string): string {
  const reconstructed = credentialDomain(site, accessToken);
  if (site.domainPolicy.kind === "fixed") return reconstructed;
  const responseDomain = requiredString(site, data[site.domainPolicy.responseField], "domain").toLowerCase();
  if (responseDomain !== reconstructed) {
    throw new Error(`${site.providerId} credential domain does not match its access-token issuer; run /login ${site.commandName} again`);
  }
  return reconstructed;
}

function responseIdentity(data: JsonRecord): { uid?: string; enterpriseId?: string } {
  const claims = jwtPayload(data.accessToken);
  return {
    uid: optionalString(data.uid) ?? optionalString(claims.uid) ?? optionalString(claims.sub),
    enterpriseId: optionalString(data.enterpriseId) ?? optionalString(data.enterprise_id),
  };
}

function identityShape(data: JsonRecord): string {
  const responseKeys = Object.keys(data).sort().join(",") || "none";
  const claimKeys = Object.keys(jwtPayload(data.accessToken)).sort().join(",") || "none";
  return `response keys: ${responseKeys}; access-token claim keys: ${claimKeys}`;
}

export function credentialFromLoginResponse(
  site: SiteDescriptor,
  data: JsonRecord,
  now = Date.now(),
): WorkBuddyCredential {
  const identity = responseIdentity(data);
  if (!identity.uid) {
    throw new Error(`${site.providerId} credential is missing uid (${identityShape(data)})`);
  }
  const credential: WorkBuddyCredential = {
    accessToken: requiredString(site, data.accessToken, "access token"),
    refreshToken: requiredString(site, data.refreshToken, "refresh token"),
    expiresAtMs: expiryFromResponse(site, data.expiresIn, now),
    uid: identity.uid,
    ...(identity.enterpriseId ? { enterpriseId: identity.enterpriseId } : {}),
  };
  const email = explicitEmail(data.email);
  const nickname = optionalString(data.nickname);
  if (email) credential.email = email;
  if (nickname) credential.nickname = nickname;
  return credential;
}

export function oauthFromWorkBuddy(credential: WorkBuddyCredential): OAuthCredentials {
  return {
    access: credential.accessToken,
    refresh: credential.refreshToken,
    expires: credential.expiresAtMs,
    accountId: credential.uid,
    ...(credential.enterpriseId ? { orgId: credential.enterpriseId } : {}),
    ...(credential.email ? { email: credential.email } : {}),
  };
}

export function validateRequestCredential(
  site: SiteDescriptor,
  credentials: OAuthCredentials,
  now = Date.now(),
): OAuthCredentials {
  requiredString(site, credentials.access, "access token");
  requiredString(site, credentials.refresh, "refresh token");
  requiredString(site, credentials.accountId, "accountId");
  if (!Number.isFinite(credentials.expires) || credentials.expires <= now) {
    throw new Error(`${site.providerId} credential is expired or has invalid expiry; run /login ${site.commandName} again`);
  }
  return credentials;
}

export function validateStoredCredential(site: SiteDescriptor, credentials: OAuthCredentials): void {
  requiredString(site, credentials.access, "access token");
  requiredString(site, credentials.refresh, "refresh token");
  requiredString(site, credentials.accountId, "accountId");
  if (!Number.isFinite(credentials.expires) || credentials.expires <= 0) {
    throw new Error(`${site.providerId} credential has invalid expiry; run /login ${site.commandName} again`);
  }
}

function throwIfCancelled(site: SiteDescriptor, signal?: AbortSignal): void {
  if (signal?.aborted) throw new LoginCancelledError(`${site.label} login cancelled`);
}

export async function loginWorkBuddy(
  site: SiteDescriptor,
  callbacks: OAuthLoginCallbacks,
  fetcher: Fetch = globalThis.fetch,
  now: () => number = Date.now,
): Promise<OAuthCredentials> {
  throwIfCancelled(site, callbacks.signal);
  callbacks.onProgress?.(`正在打开 ${site.label} 登录页…`);
  const { state, authUrl } = await startPluginLogin(site, fetcher, { signal: callbacks.signal });
  throwIfCancelled(site, callbacks.signal);
  callbacks.onAuth({ url: authUrl });
  throwIfCancelled(site, callbacks.signal);
  callbacks.onProgress?.("请在弹出的页面完成登录，完成后会自动继续");
  const response = await pollPluginToken(site, state, fetcher, { signal: callbacks.signal, now });
  throwIfCancelled(site, callbacks.signal);
  if (site.auth.finalizeIdentity === "account-endpoint") {
    const accessToken = requiredString(site, response.accessToken, "access token");
    requiredString(site, response.refreshToken, "refresh token");
    expiryFromResponse(site, response.expiresIn, now());
    const domain = verifiedResponseDomain(site, response, accessToken);
    const account = await fetchPluginAccount(site, accessToken, domain, fetcher, { signal: callbacks.signal });
    throwIfCancelled(site, callbacks.signal);
    const uid = requiredString(site, account.uid, "account uid");
    return oauthFromWorkBuddy(credentialFromLoginResponse(site, { ...response, uid }, now()));
  }
  return oauthFromWorkBuddy(credentialFromLoginResponse(site, response, now()));
}

export async function refreshWorkBuddyOAuth(
  site: SiteDescriptor,
  credentials: OAuthCredentials,
  fetcher: Fetch = globalThis.fetch,
  now = Date.now(),
  signal?: AbortSignal,
): Promise<OAuthCredentials> {
  throwIfCancelled(site, signal);
  validateStoredCredential(site, credentials);
  const orgId = optionalString(credentials.orgId);
  const domain = site.domainPolicy.kind === "jwt-issuer" ? credentialDomain(site, credentials.access) : undefined;
  const data = await refreshPluginToken(site, credentials.refresh, orgId, domain, fetcher, { signal });
  const returnedIdentity = responseIdentity(data);
  if (returnedIdentity.uid && returnedIdentity.uid !== credentials.accountId) {
    throw new Error(`${site.providerId} refresh returned a different account identity; run /login ${site.commandName} again`);
  }
  if (returnedIdentity.enterpriseId && orgId && returnedIdentity.enterpriseId !== orgId) {
    throw new Error(`${site.providerId} refresh returned a different enterprise identity; run /login ${site.commandName} again`);
  }
  const refreshed: OAuthCredentials = {
    access: requiredString(site, data.accessToken, "refreshed access token"),
    refresh: optionalString(data.refreshToken) ?? credentials.refresh,
    expires: expiryFromResponse(site, data.expiresIn, now),
    accountId: credentials.accountId,
    ...(orgId ? { orgId } : {}),
    ...(credentials.email ? { email: credentials.email } : {}),
  };
  if (site.domainPolicy.kind === "jwt-issuer") {
    const refreshedDomain = verifiedResponseDomain(site, data, refreshed.access);
    if (refreshedDomain !== domain) {
      throw new Error(`${site.providerId} refresh returned a different credential domain; run /login ${site.commandName} again`);
    }
  }
  return validateRequestCredential(site, refreshed, now);
}
