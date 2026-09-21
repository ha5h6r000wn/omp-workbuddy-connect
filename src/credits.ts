import type {
  UsageCredential,
  UsageLimit,
  UsageProvider,
  UsageReport,
} from "@oh-my-pi/pi-ai";
import { fetchWorkBuddyBillingEnvelope } from "./workbuddy-api.ts";
import type { SiteDescriptor } from "./site.ts";


export interface WorkBuddyCreditPack {
  id: string;
  name: string;
  remaining: number;
  limit?: number;
  used?: number;
}

export interface WorkBuddyCredits {
  totalRemaining: number;
  totalLimit?: number;
  plans: string[];
  packs: WorkBuddyCreditPack[];
}

type RecordValue = Record<string, unknown>;
type CredentialGuard = (credential: UsageCredential) => void;

function record(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function packageQuantity(account: RecordValue): { remaining: number; limit?: number; used?: number } | undefined {
  const hasCycleValues = ["CycleCapacitySize", "CycleCapacityRemain", "CycleCapacityUsed"]
    .some((key) => Object.hasOwn(account, key));
  const remainingKey = hasCycleValues ? "CycleCapacityRemain" : "CapacityRemain";
  const limitKey = hasCycleValues ? "CycleCapacitySize" : "CapacitySize";
  const usedKey = hasCycleValues ? "CycleCapacityUsed" : "CapacityUsed";
  const remaining = finiteNumber(account[remainingKey]);
  if (remaining === undefined || remaining < 0) return undefined;

  const hasLimit = Object.hasOwn(account, limitKey);
  const limit = finiteNumber(account[limitKey]);
  if (hasLimit && (limit === undefined || limit < 0 || remaining > limit)) return undefined;

  const hasUsed = Object.hasOwn(account, usedKey);
  const reportedUsed = finiteNumber(account[usedKey]);
  if (hasUsed && (reportedUsed === undefined || reportedUsed < 0 || (limit !== undefined && reportedUsed > limit))) {
    return undefined;
  }
  const used = reportedUsed ?? (limit !== undefined ? limit - remaining : undefined);
  return { remaining, ...(limit !== undefined ? { limit } : {}), ...(used !== undefined ? { used } : {}) };
}

/** Strictly accepts a successful Billing envelope. Invalid data is unavailable, never zero. */
export function parseWorkBuddyCredits(envelope: unknown): WorkBuddyCredits | undefined {
  const root = record(envelope);
  if (!root || root.code !== 0) return undefined;
  const data = record(root.data);
  const response = record(data?.Response);
  const payload = record(response?.Data);
  if (!payload || !Array.isArray(payload.Accounts) || payload.Accounts.length === 0) return undefined;

  const packs: WorkBuddyCreditPack[] = [];
  for (const [index, value] of payload.Accounts.entries()) {
    const account = record(value);
    if (!account) return undefined;
    const quantity = packageQuantity(account);
    if (!quantity) return undefined;
    const name = typeof account.PackageName === "string" && account.PackageName.trim() !== ""
      ? account.PackageName.trim()
      : `Package ${index + 1}`;
    packs.push({ id: `package:${index}:${name}`, name, ...quantity });
  }

  const totalRemaining = packs.reduce((sum, pack) => sum + pack.remaining, 0);
  const hasCompleteLimits = packs.every((pack) => pack.limit !== undefined && pack.remaining <= pack.limit);
  const totalLimit = hasCompleteLimits
    ? packs.reduce((sum, pack) => sum + pack.limit!, 0)
    : undefined;
  return {
    totalRemaining,
    ...(totalLimit !== undefined ? { totalLimit } : {}),
    plans: [...new Set(packs.map((pack) => pack.name))],
    packs,
  };
}

function usageLimit(site: SiteDescriptor, pack: WorkBuddyCreditPack, credential: UsageCredential): UsageLimit {
  const fraction = pack.limit && pack.limit > 0 ? pack.remaining / pack.limit : undefined;
  return {
    id: pack.id,
    label: pack.name,
    scope: {
      provider: site.usage.providerId,
      accountId: credential.accountId,
      orgId: credential.orgId,
      tier: pack.name,
    },
    amount: {
      unit: "credits",
      remaining: pack.remaining,
      ...(pack.limit !== undefined ? { limit: pack.limit } : {}),
      ...(pack.used !== undefined ? { used: pack.used } : {}),
    },
    status: pack.remaining === 0 ? "exhausted" : fraction !== undefined && fraction <= 0.2 ? "warning" : "ok",
  };
}

export function summarizeWorkBuddyUsage(site: SiteDescriptor, report: UsageReport): WorkBuddyCredits | undefined {
  if (report.provider !== site.usage.providerId) return undefined;
  const metadata = report.metadata;
  const totalRemaining = finiteNumber(metadata?.totalRemaining);
  const totalLimit = finiteNumber(metadata?.totalLimit);
  const plans = Array.isArray(metadata?.plans)
    ? metadata.plans.filter((value): value is string => typeof value === "string")
    : [];
  if (
    totalRemaining === undefined
    || totalRemaining < 0
    || (metadata?.totalLimit !== undefined && (totalLimit === undefined || totalLimit < totalRemaining))
  ) return undefined;

  const packs: WorkBuddyCreditPack[] = [];
  for (const limit of report.limits) {
    const remaining = finiteNumber(limit.amount.remaining);
    const packLimit = finiteNumber(limit.amount.limit);
    const used = finiteNumber(limit.amount.used);
    if (
      limit.amount.unit !== "credits"
      || remaining === undefined
      || remaining < 0
      || (limit.amount.limit !== undefined && (packLimit === undefined || packLimit < remaining))
      || (limit.amount.used !== undefined && (used === undefined || used < 0 || (packLimit !== undefined && used > packLimit)))
    ) return undefined;
    packs.push({
      id: limit.id,
      name: limit.label,
      remaining,
      ...(packLimit !== undefined ? { limit: packLimit } : {}),
      ...(used !== undefined ? { used } : {}),
    });
  }
  if (packs.length === 0) return undefined;
  return { totalRemaining, ...(totalLimit !== undefined ? { totalLimit } : {}), plans, packs };
}

export function createWorkBuddyUsageProvider(
  site: SiteDescriptor,
  validateCredential: CredentialGuard,
): UsageProvider {
  return {
    id: site.usage.providerId,
    retainLastGoodOnFailure: false,
    validatesCredentials: false,
    supports: ({ provider, credential }) => provider === site.usage.providerId
      && credential.type === "oauth"
      && Boolean(credential.accessToken && credential.accountId),
    async fetchUsage(params, ctx): Promise<UsageReport | null> {
      if (params.provider !== site.usage.providerId || params.credential.type !== "oauth") return null;
      try {
        validateCredential(params.credential);
        const envelope = await fetchWorkBuddyBillingEnvelope(site, params.credential, ctx.fetch, params.signal);
        const credits = parseWorkBuddyCredits(envelope);
        if (!credits) return null;
        return {
          provider: site.usage.providerId,
          fetchedAt: Date.now(),
          limits: credits.packs.map((pack) => usageLimit(site, pack, params.credential)),
          metadata: {
            source: site.usage.source,
            accountId: params.credential.accountId,
            ...(params.credential.orgId ? { orgId: params.credential.orgId } : {}),
            totalRemaining: credits.totalRemaining,
            ...(credits.totalLimit !== undefined ? { totalLimit: credits.totalLimit } : {}),
            plans: credits.plans,
          },
        };
      } catch (error) {
        ctx.logger?.warn(`${site.label} usage request unavailable`, {
          provider: site.usage.providerId,
          error: error instanceof Error ? error.name : "unknown",
        });
        return null;
      }
    },
  };
}
