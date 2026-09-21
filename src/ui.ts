import type { OAuthAccountSummary, UsageReport } from "@oh-my-pi/pi-ai";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { summarizeWorkBuddyUsage, type WorkBuddyCredits } from "./credits.ts";
import type { ModelScope, ProductConfigFallbackReason, ProductConfigSource } from "./models.ts";
import { WORKBUDDY_PROVIDER } from "./provider.ts";

const FALLBACK_REASON_LABELS: Record<ProductConfigFallbackReason, string> = {
  missing: "缓存不存在",
  unreadable: "缓存不可读",
  "invalid-json": "JSON 无效",
  "invalid-schema": "结构无效",
  "no-valid-models": "无有效模型",
};

export interface WorkBuddyUiView {
  scope: ModelScope;
  models: ReadonlyArray<{ id: string; name: string }>;
  source: ProductConfigSource;
  fallbackReason?: ProductConfigFallbackReason;
  transitioning: boolean;
}

type CreditsState =
  | { kind: "unqueried" }
  | { kind: "loading" }
  | { kind: "available"; report: UsageReport; credits: WorkBuddyCredits }
  | { kind: "unavailable" };

interface RefreshOptions {
  forceRefresh?: boolean;
  notify?: boolean;
  showWhenInactive?: boolean;
  showWidget?: boolean;
}

function accountKey(account: OAuthAccountSummary): string {
  return `${account.credentialId}:${account.accountId ?? ""}:${account.orgId ?? ""}`;
}

function redactIdentity(value: string | undefined): string {
  if (!value) return "不可用";
  const at = value.indexOf("@");
  if (at > 0) {
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (value.length <= 8) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export class WorkBuddyUiController {
  #stateGeneration = 0;
  #abort = new AbortController();
  #credits: CreditsState = { kind: "unqueried" };
  #activeSessionId: string | undefined;
  #accountKey: string | undefined;

  constructor(private readonly currentView: () => WorkBuddyUiView) {}

  invalidate(reason: string): void {
    this.#stateGeneration += 1;
    this.#abort.abort(reason);
    this.#abort = new AbortController();
    this.#credits = { kind: "unqueried" };
  }

  beginSession(ctx: ExtensionContext): void {
    this.invalidate("WorkBuddy session initialized");
    this.#activeSessionId = ctx.sessionManager.getSessionId();
    this.#invalidateOnAccountChange(ctx);
    if (!ctx.hasUI) return;
    this.#safeWidget(ctx, undefined);
    this.#safeStatus(ctx, undefined);
  }

  syncTurn(ctx: ExtensionContext): void {
    this.#invalidateOnAccountChange(ctx);
    this.invalidate("WorkBuddy detail dismissed on next turn");
    if (!ctx.hasUI) return;
    this.#safeWidget(ctx, undefined);
    this.#safeStatus(ctx, undefined);
  }

  clear(ctx: ExtensionContext, reason: string): void {
    this.invalidate(reason);
    if (!ctx.hasUI) return;
    this.#safeWidget(ctx, undefined);
    this.#safeStatus(ctx, undefined);
  }

  shutdown(): void {
    this.invalidate("WorkBuddy session shutdown");
    this.#activeSessionId = undefined;
    this.#accountKey = undefined;
  }

  async refresh(ctx: ExtensionContext, options: RefreshOptions = {}): Promise<string[] | undefined> {
    if (!ctx.hasUI) return undefined;
    const view = this.currentView();
    const show = options.showWhenInactive || ctx.model?.provider === WORKBUDDY_PROVIDER;
    if (!show) {
      this.clear(ctx, "WorkBuddy model inactive");
      return undefined;
    }

    const accounts = ctx.modelRegistry.authStorage.listOAuthAccounts(
      WORKBUDDY_PROVIDER,
      ctx.sessionManager.getSessionId(),
    );
    const account = accounts.length === 1 && accounts[0]?.accountId ? accounts[0] : undefined;
    if (!account) {
      this.invalidate("WorkBuddy account unavailable");
      this.#credits = { kind: "unavailable" };
      return this.#render(ctx, undefined, options);
    }

    const nextAccountKey = accountKey(account);
    if (this.#accountKey !== undefined && this.#accountKey !== nextAccountKey) {
      this.invalidate("WorkBuddy account switched");
    }
    this.#accountKey = nextAccountKey;
    const generation = ++this.#stateGeneration;
    this.#abort.abort("WorkBuddy UI superseded");
    this.#abort = new AbortController();
    const signal = this.#abort.signal;
    const sessionId = ctx.sessionManager.getSessionId();
    const scope = view.scope;
    this.#credits = { kind: "loading" };
    this.#render(ctx, account, { showWidget: options.showWidget });

    let nextCredits: CreditsState;
    try {
      if (options.forceRefresh) {
        await ctx.modelRegistry.authStorage.invalidateUsageCache(WORKBUDDY_PROVIDER, signal);
      }
      const reports = await ctx.modelRegistry.authStorage.fetchUsageReports({ signal });
      const report = reports?.find((candidate) => candidate.provider === WORKBUDDY_PROVIDER
        && candidate.limits.every((limit) => !limit.scope.accountId || limit.scope.accountId === account.accountId));
      const credits = report ? summarizeWorkBuddyUsage(report) : undefined;
      nextCredits = report && credits ? { kind: "available", report, credits } : { kind: "unavailable" };
    } catch {
      nextCredits = { kind: "unavailable" };
    }
    if (!this.#isCurrent(ctx, generation, sessionId, scope, nextAccountKey, options.showWhenInactive)) return undefined;
    this.#credits = nextCredits;
    return this.#render(ctx, account, options);
  }

  #invalidateOnAccountChange(ctx: ExtensionContext): void {
    const accounts = ctx.modelRegistry.authStorage.listOAuthAccounts(
      WORKBUDDY_PROVIDER,
      ctx.sessionManager.getSessionId(),
    );
    const nextKey = accounts.length === 1 && accounts[0]?.accountId ? accountKey(accounts[0]) : undefined;
    if (this.#accountKey !== undefined && this.#accountKey !== nextKey) this.invalidate("WorkBuddy account switched");
    this.#accountKey = nextKey;
  }

  #isCurrent(
    ctx: ExtensionContext,
    generation: number,
    sessionId: string,
    scope: ModelScope,
    expectedAccountKey: string,
    showWhenInactive = false,
  ): boolean {
    if (generation !== this.#stateGeneration || this.#abort.signal.aborted || !ctx.hasUI) return false;
    if (this.#activeSessionId !== sessionId || ctx.sessionManager.getSessionId() !== sessionId) return false;
    if (!showWhenInactive && ctx.model?.provider !== WORKBUDDY_PROVIDER) return false;
    if (this.currentView().scope !== scope) return false;
    const accounts = ctx.modelRegistry.authStorage.listOAuthAccounts(WORKBUDDY_PROVIDER, sessionId);
    return accounts.length === 1 && accounts[0]?.accountId !== undefined && accountKey(accounts[0]) === expectedAccountKey;
  }

  #lines(account: OAuthAccountSummary | undefined): string[] {
    const view = this.currentView();
    const source = `${view.source}${view.fallbackReason ? ` · ${FALLBACK_REASON_LABELS[view.fallbackReason]}` : ""}`;
    const visibleNames = view.models.slice(0, 4).map((model) => model.name);
    const hiddenModelCount = view.models.length - visibleNames.length;
    if (hiddenModelCount > 0) visibleNames.push(`… +${hiddenModelCount}`);
    const names = visibleNames.join(" | ");
    const lines = [
      "WorkBuddy AI · 国际版",
      `账号  ${redactIdentity(account?.email || account?.accountId)}`,
      `范围  ${view.scope} · ${view.models.length} 模型 · ${source}`,
      `模型  ${names || "（当前范围为空）"}`,
    ];

    if (this.#credits.kind === "available") {
      const { credits } = this.#credits;
      const packs = credits.packs.map((pack) => {
        const amount = pack.limit === undefined ? String(pack.remaining) : `${pack.remaining} / ${pack.limit}`;
        return `${pack.name} ${amount}`;
      });
      lines.push(`积分  ${credits.totalRemaining}`);
      lines.push(`套餐  ${packs.join("  |  ")}`);
    } else if (this.#credits.kind === "loading") {
      lines.push("积分  查询中");
      lines.push("套餐  查询中");
    } else if (this.#credits.kind === "unavailable") {
      lines.push("积分  不可用");
      lines.push("套餐  不可用");
    } else {
      lines.push("积分  未查询");
      lines.push("套餐  未查询");
    }

    const providerState = view.transitioning
      ? "切换中"
      : !account
        ? "认证不可用"
        : view.models.length === 0
          ? "已就绪（当前范围无模型）"
          : "已就绪";
    lines.push(`Provider  ${providerState}`);
    return lines;
  }

  #render(
    ctx: ExtensionContext,
    account: OAuthAccountSummary | undefined,
    options: Pick<RefreshOptions, "notify" | "showWidget"> = {},
  ): string[] | undefined {
    if (!ctx.hasUI) return undefined;
    const lines = this.#lines(account);
    this.#safeWidget(ctx, options.showWidget ? lines : undefined);
    // OMP already owns the persistent status line. WorkBuddy details are
    // intentionally command-scoped and disappear on the next turn.
    this.#safeStatus(ctx, undefined);
    if (options.notify) {
      const message = this.#credits.kind === "available"
        ? `WorkBuddy 状态已更新 · 积分 ${this.#credits.credits.totalRemaining}`
        : "WorkBuddy 状态已更新 · 积分不可用";
      this.#safeNotify(ctx, message, this.#credits.kind === "available" ? "info" : "warning");
    }
    return lines;
  }

  #safeWidget(ctx: ExtensionContext, content: string[] | undefined): void {
    try {
      ctx.ui.setWidget("workbuddy", content);
    } catch {
      // Optional UI failures never enter the Chat plane.
    }
  }

  #safeStatus(ctx: ExtensionContext, text: string | undefined): void {
    try {
      ctx.ui.setStatus("workbuddy", text);
    } catch {
      // Optional UI failures never enter the Chat plane.
    }
  }

  #safeNotify(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error"): void {
    try {
      ctx.ui.notify(message, type);
    } catch {
      // Optional UI failures never enter the Chat plane.
    }
  }
}
