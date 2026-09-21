import { LoginCancelledError } from "@oh-my-pi/pi-ai/error";
import { setTimeout as sleep } from "node:timers/promises";
import { siteUrl, type SiteDescriptor } from "./site.ts";

const REQUEST_TIMEOUT_MS = 30_000;


type JsonRecord = Record<string, unknown>;
type Fetch = typeof globalThis.fetch;

export interface WorkBuddyRequestOptions {
  signal?: AbortSignal;
  requestTimeoutMs?: number;
}

export interface WorkBuddyPollOptions extends WorkBuddyRequestOptions {
  pollIntervalMs?: number;
  deadlineMs?: number;
  now?: () => number;
}

export type WorkBuddyOAuthErrorKind =
  | "authorization_rejected"
  | "poll_timeout"
  | "network_failure"
  | "server_failure"
  | "rate_limited"
  | "invalid_response"
  | "token_refresh";

export class WorkBuddyOAuthError extends Error {
  readonly kind: WorkBuddyOAuthErrorKind;
  readonly status?: number;

  constructor(
    kind: WorkBuddyOAuthErrorKind,
    message: string,
    status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WorkBuddyOAuthError";
    this.kind = kind;
    this.status = status;
  }
}

function throwIfCancelled(site: SiteDescriptor, signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new LoginCancelledError(`${site.label} login cancelled`);
  }
}

async function oauthFetch(
  site: SiteDescriptor,
  fetcher: Fetch,
  input: string,
  init: RequestInit,
  options: WorkBuddyRequestOptions,
): Promise<Response> {
  throwIfCancelled(site, options.signal);
  const timeoutMs = Math.max(1, options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  try {
    const response = await fetcher(input, { ...init, signal });
    throwIfCancelled(site, options.signal);
    return response;
  } catch (error) {
    throwIfCancelled(site, options.signal);
    if (timeoutSignal.aborted) {
      throw new WorkBuddyOAuthError(
        "network_failure",
        `${site.label} OAuth request timed out`,
        undefined,
        { cause: error },
      );
    }
    throw new WorkBuddyOAuthError(
      "network_failure",
      `${site.label} OAuth network failure`,
      undefined,
      { cause: error },
    );
  }
}

async function readEnvelope(site: SiteDescriptor, response: Response): Promise<JsonRecord> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new WorkBuddyOAuthError(
      "invalid_response",
      `${site.label} OAuth returned invalid JSON`,
      response.status,
      { cause: error },
    );
  }
  if (
    typeof parsed !== "object"
    || parsed === null
    || Array.isArray(parsed)
    || typeof (parsed as JsonRecord).code !== "number"
    || !Number.isFinite((parsed as JsonRecord).code)
  ) {
    throw new WorkBuddyOAuthError(
      "invalid_response",
      `${site.label} OAuth returned an invalid envelope`,
      response.status,
    );
  }
  return parsed as JsonRecord;
}

function envelopeData(site: SiteDescriptor, envelope: JsonRecord, response: Response): JsonRecord {
  const data = envelope.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new WorkBuddyOAuthError(
      "invalid_response",
      `${site.label} OAuth returned invalid data`,
      response.status,
    );
  }
  return data as JsonRecord;
}

function responseError(
  site: SiteDescriptor,
  response: Response,
  kind: "authorization_rejected" | "token_refresh",
): WorkBuddyOAuthError {
  if (response.status === 429) {
    return new WorkBuddyOAuthError("rate_limited", `${site.label} OAuth rate limited`, 429);
  }
  if (response.status >= 500) {
    return new WorkBuddyOAuthError(
      "server_failure",
      `${site.label} OAuth service failure`,
      response.status,
    );
  }
  return new WorkBuddyOAuthError(
    kind,
    kind === "authorization_rejected"
      ? `${site.label} authorization was rejected`
      : `${site.label} token refresh was rejected; run /login ${site.commandName} again`,
    response.status,
  );
}

function retryAfterMs(response: Response, now: number): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, date - now);
}

async function wait(site: SiteDescriptor, ms: number, signal?: AbortSignal): Promise<void> {
  throwIfCancelled(site, signal);
  try {
    await sleep(ms, undefined, { signal });
  } catch (error) {
    throwIfCancelled(site, signal);
    throw error;
  }
  throwIfCancelled(site, signal);
}

export async function startPluginLogin(
  site: SiteDescriptor,
  fetcher: Fetch = globalThis.fetch,
  options: WorkBuddyRequestOptions = {},
): Promise<{ state: string; authUrl: string }> {
  const nonce = site.auth.nonceMode === "query-and-body"
    ? crypto.randomUUID().replaceAll("-", "")
    : undefined;
  const query = new URLSearchParams({ platform: site.auth.platform });
  if (nonce) query.set("nonce", nonce);
  const response = await oauthFetch(site, fetcher, `${siteUrl(site, site.auth.startPath)}?${query}`, {
    method: "POST",
    headers: site.auth.headers,
    body: JSON.stringify(nonce ? { nonce } : {}),
  }, options);
  if (!response.ok) throw responseError(site, response, "authorization_rejected");
  const envelope = await readEnvelope(site, response);
  if (envelope.code !== 0) throw responseError(site, response, "authorization_rejected");
  const data = envelopeData(site, envelope, response);
  const state = typeof data.state === "string" ? data.state.trim() : "";
  const authUrl = typeof data.authUrl === "string" ? data.authUrl.trim() : "";
  let parsedAuthUrl: URL | undefined;
  try {
    parsedAuthUrl = new URL(authUrl);
  } catch {
    // Rejected by the common incomplete-data branch below.
  }
  if (
    state === ""
    || !parsedAuthUrl
    || !site.auth.allowedLoginOrigins.includes(parsedAuthUrl.origin)
    || parsedAuthUrl.username !== ""
    || parsedAuthUrl.password !== ""
  ) {
    throw new WorkBuddyOAuthError(
      "invalid_response",
      `${site.label} login start returned incomplete or untrusted data`,
    );
  }
  throwIfCancelled(site, options.signal);
  return { state, authUrl };
}

export async function pollPluginToken(
  site: SiteDescriptor,
  state: string,
  fetcher: Fetch = globalThis.fetch,
  options: WorkBuddyPollOptions = {},
): Promise<JsonRecord> {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.deadlineMs ?? site.auth.pollDeadlineMs);
  const pollIntervalMs = options.pollIntervalMs ?? site.auth.pollIntervalMs;
  while (true) {
    throwIfCancelled(site, options.signal);
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw new WorkBuddyOAuthError(
        "poll_timeout",
        `${site.label} authorization polling timed out`,
      );
    }
    const response = await oauthFetch(
      site,
      fetcher,
      `${siteUrl(site, site.auth.tokenPath)}?state=${encodeURIComponent(state)}`,
      { headers: site.auth.headers },
      {
        signal: options.signal,
        requestTimeoutMs: Math.min(options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS, remainingMs),
      },
    );
    if (response.status === 429) {
      const delayMs = retryAfterMs(response, now());
      if (delayMs === undefined) throw responseError(site, response, "authorization_rejected");
      await wait(site, Math.min(delayMs, Math.max(0, deadline - now())), options.signal);
      continue;
    }
    if (!response.ok) throw responseError(site, response, "authorization_rejected");
    const envelope = await readEnvelope(site, response);
    if (envelope.code === site.auth.pendingCode) {
      await wait(site, Math.min(pollIntervalMs, Math.max(0, deadline - now())), options.signal);
      continue;
    }
    if (envelope.code !== 0) throw responseError(site, response, "authorization_rejected");
    throwIfCancelled(site, options.signal);
    return envelopeData(site, envelope, response);
  }
}

export async function refreshPluginToken(
  site: SiteDescriptor,
  refreshToken: string,
  enterpriseId: string | undefined,
  fetcher: Fetch = globalThis.fetch,
  options: WorkBuddyRequestOptions = {},
): Promise<JsonRecord> {
  const response = await oauthFetch(site, fetcher, siteUrl(site, site.auth.refreshPath), {
    method: "POST",
    headers: {
      ...site.protocolHeaders,
      "X-Refresh-Token": refreshToken,
      "X-Auth-Refresh-Source": site.auth.refreshSource,
      ...(enterpriseId ? { "X-Enterprise-Id": enterpriseId } : {}),
    },
  }, options);
  if (!response.ok) throw responseError(site, response, "token_refresh");
  const envelope = await readEnvelope(site, response);
  if (envelope.code !== 0) throw responseError(site, response, "token_refresh");
  throwIfCancelled(site, options.signal);
  return envelopeData(site, envelope, response);
}

function formatBillingTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function fetchWorkBuddyBillingEnvelope(
  site: SiteDescriptor,
  credential: { accessToken?: string; accountId?: string },
  fetcher: Fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  const accessToken = credential.accessToken?.trim();
  const accountId = credential.accountId?.trim();
  if (!accessToken || !accountId) throw new Error(`${site.label} Billing credential identity is incomplete`);
  const now = new Date();
  const response = await fetcher(siteUrl(site, site.usage.billingPath), {
    method: "POST",
    headers: {
      ...site.protocolHeaders,
      Authorization: `Bearer ${accessToken}`,
      "X-User-Id": accountId,
    },
    body: JSON.stringify({
      PageNumber: 1,
      PageSize: 100,
      ProductCode: "p_tcaca",
      Status: [0, 3],
      PackageEndTimeRangeBegin: formatBillingTimestamp(now),
      PackageEndTimeRangeEnd: formatBillingTimestamp(new Date(now.getTime() + 365 * 101 * 24 * 60 * 60 * 1000)),
    }),
    signal,
  });
  if (!response.ok) throw new Error(`${site.label} Billing HTTP ${response.status}`);
  return response.json();
}
