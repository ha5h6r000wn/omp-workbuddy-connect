import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage } from "@oh-my-pi/pi-ai";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { createWorkBuddyProvider } from "../src/provider.ts";
import { parseWorkBuddyCredits, summarizeWorkBuddyUsage } from "../src/credits.ts";
import { fetchWorkBuddyBillingEnvelope } from "../src/workbuddy-api.ts";
import { WORKBUDDY_CN, WORKBUDDY_INTL } from "../src/site.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const temp = await mkdtemp(join(tmpdir(), "workbuddy-credits-"));
let mode: "success" | "zero" | "failure" | "malformed" | "slow" = "success";
let calls = 0;
let lastHeaders: Headers | undefined;
const usageFetch: typeof fetch = async (_input, init) => {
  calls += 1;
  lastHeaders = new Headers(init?.headers);
  if (mode === "failure") return new Response(null, { status: 503 });
  if (mode === "malformed") return Response.json({ code: 0, data: { Response: { Data: {} } } });
  if (mode === "slow") {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("Billing request was issued without an abort signal"));
        return;
      }
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const watchdog = setTimeout(
        () => reject(new Error("Billing request was never aborted by the host timeout")),
        3_000,
      );
      signal.addEventListener("abort", () => {
        clearTimeout(watchdog);
        reject(signal.reason);
      }, { once: true });
    });
  }
  const remaining = mode === "zero" ? 0 : 5;
  return Response.json({
    code: 0,
    data: {
      Response: {
        Data: {
          Accounts: [{
            PackageName: "International Plan",
            CycleCapacitySize: 10,
            CycleCapacityRemain: remaining,
          }],
        },
      },
    },
  });
};
const authStorage = await AuthStorage.create(join(temp, "auth.db"), {
  usageFetch,
  usageRequestTimeoutMs: 25,
});
const registry = new ModelRegistry(authStorage, join(temp, "models.yml"), {
  cacheDbPath: join(temp, "models.db"),
});
await authStorage.credentials.set("workbuddy", {
  type: "oauth",
  access: "billing-access",
  refresh: "billing-refresh",
  expires: Date.now() + 60 * 60 * 1000,
  accountId: "billing-account",
  orgId: "billing-org",
});
const controller = createWorkBuddyProvider(WORKBUDDY_INTL);
controller.bindContext({
  modelRegistry: registry,
  sessionManager: { getSessionId: () => "credits-contract" },
} as unknown as ExtensionContext);
registry.registerProvider("workbuddy", controller.config([]));

try {
  const usage = authStorage.usage.providerFor("workbuddy");
  assert(usage?.retainLastGoodOnFailure === false, "UsageProvider retained stale successful credits");
  assert(usage.validatesCredentials === false, "UsageProvider overclaimed credential health validation");

  const callsBeforeDisabled = calls;
  let disabledBillingRejected = false;
  try {
    await fetchWorkBuddyBillingEnvelope(
      WORKBUDDY_CN,
      { accessToken: "must-not-send", accountId: "must-not-send" },
      usageFetch,
    );
  } catch (error) {
    disabledBillingRejected = error instanceof Error && error.message.includes("Billing is disabled");
  }
  assert(disabledBillingRejected, "disabled CN Billing did not fail closed");
  assert(calls === callsBeforeDisabled, "disabled CN Billing reached the realm origin");

  const semanticallyInvalidAccounts: unknown[] = [
    { PackageName: "negative remaining", CycleCapacitySize: 10, CycleCapacityRemain: -1 },
    { PackageName: "remaining above limit", CycleCapacitySize: 10, CycleCapacityRemain: 11 },
    { PackageName: "negative used", CycleCapacitySize: 10, CycleCapacityRemain: 5, CycleCapacityUsed: -1 },
    { PackageName: "used above limit", CycleCapacitySize: 10, CycleCapacityRemain: 5, CycleCapacityUsed: 11 },
    { PackageName: "negative limit", CycleCapacitySize: -1, CycleCapacityRemain: 0 },
  ];
  for (const account of semanticallyInvalidAccounts) {
    assert(parseWorkBuddyCredits({
      code: 0,
      data: { Response: { Data: { Accounts: [account] } } },
    }) === undefined, "semantically invalid numeric credits were accepted");
  }
  assert(parseWorkBuddyCredits({
    code: 0,
    data: { Response: { Data: { Accounts: [] } } },
  }) === undefined, "empty package list was presented as genuine zero without live evidence");
  assert(summarizeWorkBuddyUsage(WORKBUDDY_INTL, {
    provider: "workbuddy",
    fetchedAt: Date.now(),
    limits: [],
    metadata: { totalRemaining: 0, totalLimit: 0, plans: [] },
  }) === undefined, "empty normalized usage report was presented as genuine zero");

  let reports = await authStorage.usage.reports();
  assert(reports?.length === 1, "successful Billing response did not produce one report");
  assert(reports[0]?.metadata?.totalRemaining === 5, "remaining credits were not normalized");
  assert(reports[0]?.metadata?.plans instanceof Array, "plan metadata was not normalized");
  assert(lastHeaders?.get("x-user-id") === "billing-account", "Billing omitted host accountId");
  assert(lastHeaders?.get("authorization") === "Bearer billing-access", "Billing did not use host OAuth access");
  assert(!lastHeaders?.has("x-enterprise-id"), "Billing sent unevidenced X-Enterprise-Id");

  mode = "failure";
  await authStorage.usage.invalidate("workbuddy");
  reports = await authStorage.usage.reports();
  assert(reports?.length === 0, "5xx reused the last-good credit report");

  mode = "malformed";
  await authStorage.usage.invalidate("workbuddy");
  reports = await authStorage.usage.reports();
  assert(reports?.length === 0, "malformed Billing response was parsed as zero credits");

  mode = "zero";
  await authStorage.usage.invalidate("workbuddy");
  reports = await authStorage.usage.reports();
  assert(reports?.[0]?.metadata?.totalRemaining === 0, "genuine zero credits were not preserved");
  const zeroSummary = summarizeWorkBuddyUsage(WORKBUDDY_INTL, reports[0]!);
  assert(
    zeroSummary?.totalRemaining === 0
      && zeroSummary.totalLimit === 10
      && zeroSummary.packs[0]?.remaining === 0,
    "normalized genuine-zero package was rejected or altered",
  );

  mode = "slow";
  await authStorage.usage.invalidate("workbuddy");
  const started = Date.now();
  reports = await authStorage.usage.reports();
  assert(reports?.length === 0, "timed-out Billing returned a report");
  assert(Date.now() - started < 1_000, "Billing timeout did not terminate promptly");

  await authStorage.credentials.set("workbuddy", [
    {
      type: "oauth",
      access: "billing-access",
      refresh: "billing-refresh",
      expires: Date.now() + 60 * 60 * 1000,
      accountId: "billing-account",
      orgId: "billing-org",
    },
    {
      type: "oauth",
      access: "second-access",
      refresh: "second-refresh",
      expires: Date.now() + 60 * 60 * 1000,
      accountId: "second-account",
    },
  ]);
  mode = "success";
  const callsBeforeAmbiguous = calls;
  await authStorage.usage.invalidate("workbuddy");
  reports = await authStorage.usage.reports();
  assert(reports?.length === 0, "ambiguous stored accounts produced Billing usage");
  assert(calls === callsBeforeAmbiguous, "ambiguous stored accounts reached Billing HTTP");

  console.log("OK: UsageProvider maps identity, strict numeric semantics, failures, timeout, and stale-cache policy");
} finally {
  authStorage.close();
  await rm(temp, { recursive: true, force: true });
}
