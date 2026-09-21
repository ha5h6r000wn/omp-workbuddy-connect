// WorkBuddy international and China providers for OMP.
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { createWorkBuddyProvider } from "../src/provider.ts";
import {
  buildOmpModels,
  loadProductConfig,
  type ModelScope as Scope,
} from "../src/models.ts";
import {
  asProviderPayload,
  normalizeNamedToolChoice,
  type ProviderPayload,
} from "../src/payload.ts";
import { loadSettings, saveSettings } from "../src/settings.ts";
import { WORKBUDDY_CN, WORKBUDDY_INTL, type SiteDescriptor } from "../src/site.ts";
import { WorkBuddyUiController } from "../src/ui.ts";

interface RealmRuntime {
  readonly site: SiteDescriptor;
  transformPayload(payload: unknown): ProviderPayload | undefined;
}

export function installRealm(pi: ExtensionAPI, site: SiteDescriptor): RealmRuntime {
  const provider = createWorkBuddyProvider(site);
  let scope = loadSettings(site).scope;
  let catalog = loadProductConfig(site);
  let models = buildOmpModels(site, catalog, scope);
  let activeIds = new Set(models.map((model) => model.id));
  let transitioning = false;
  provider.setModelAccess(activeIds, transitioning);

  const ui = new WorkBuddyUiController(site, () => ({
    scope,
    models,
    source: catalog.source,
    fallbackReason: catalog.fallbackReason,
    transitioning,
  }));

  function installProvider(nextModels: typeof models): void {
    // OMP ignores an empty static overlay, so unregister only to clear that case.
    if (nextModels.length === 0) pi.unregisterProvider(site.providerId);
    pi.registerProvider(site.providerId, provider.config(nextModels));
  }

  function throwAfterRollback(previousModels: typeof models, original: unknown): never {
    try {
      installProvider(previousModels);
    } catch (rollbackError) {
      throw new AggregateError(
        [original, rollbackError],
        `${site.displayName} model scope update failed and the previous provider could not be restored`,
      );
    }
    throw original;
  }

  function notify(
    ctx: ExtensionContext,
    message: string,
    type: "info" | "warning" | "error",
  ): void {
    if (!ctx.hasUI) return;
    try {
      ctx.ui.notify(message, type);
    } catch {
      // Management UI is optional and cannot enter the Chat plane.
    }
  }

  async function switchScope(nextScope: Scope, ctx: ExtensionContext): Promise<void> {
    if (transitioning) throw new Error(`${site.displayName} model scope update is already in progress`);

    const nextCatalog = loadProductConfig(site);
    const nextModels = buildOmpModels(site, nextCatalog, nextScope);
    const nextActiveIds = new Set(nextModels.map((model) => model.id));
    const previousModels = models;
    transitioning = true;
    provider.setModelAccess(activeIds, transitioning);
    ui.clear(ctx, `${site.displayName} model scope changed`);
    try {
      try {
        installProvider(nextModels);
      } catch (error) {
        throwAfterRollback(previousModels, error);
      }
      try {
        await saveSettings(site, nextScope);
      } catch (error) {
        throwAfterRollback(previousModels, error);
      }

      scope = nextScope;
      catalog = nextCatalog;
      models = nextModels;
      activeIds = nextActiveIds;
      if (
        ctx.model?.provider === site.providerId
        && typeof ctx.model.id === "string"
        && !activeIds.has(ctx.model.id)
      ) {
        notify(
          ctx,
          `当前模型 ${ctx.model.id} 已不在 ${site.label} ${scope} 范围内，请重新选择模型`,
          "warning",
        );
      }
    } finally {
      transitioning = false;
      provider.setModelAccess(activeIds, transitioning);
    }
  }

  async function chooseScope(nextScope: Scope, ctx: ExtensionContext): Promise<void> {
    try {
      await switchScope(nextScope, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(ctx, `${site.label} 模型范围切换失败：${message}`, "error");
      return;
    }
    notify(ctx, `${site.label} 模型范围已切换为 ${nextScope}`, "info");
  }

  async function logout(ctx: ExtensionContext): Promise<void> {
    ui.invalidate(`${site.displayName} logout`);
    try {
      await provider.logout();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(ctx, `${site.label} 退出失败：${message}`, "error");
      return;
    }

    ui.clear(ctx, `${site.displayName} logout complete`);
    try {
      installProvider(models);
      notify(ctx, `${site.label} 已断开登录`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(ctx, `${site.label} 已断开登录，但 Provider 状态刷新失败：${message}`, "warning");
    }
  }

  installProvider(models);

  pi.on("session_start", (_event, ctx) => {
    provider.bindContext(ctx);
    // Bind request runtime and clear stale command-scoped UI; startup never requests Billing.
    ui.beginSession(ctx);
  });

  pi.on("session_switch", (_event, ctx) => {
    provider.bindContext(ctx);
    ui.beginSession(ctx);
  });

  pi.on("session_shutdown", () => {
    ui.shutdown();
    provider.shutdown();
  });

  pi.on("turn_start", (_event, ctx) => {
    ui.syncTurn(ctx);
  });

  pi.registerCommand(site.commandName, {
    description: `按需显示 ${site.label} 状态；可切换 free/all 范围或 logout`,
    handler: async (args, ctx) => {
      const command = String(args ?? "").trim().toLowerCase();
      if (command === "free" || command === "all") {
        await chooseScope(command, ctx);
        return;
      }
      if (command === "logout" || command === "disconnect") {
        await logout(ctx);
        return;
      }
      if (command !== "") {
        notify(ctx, `未知 ${site.label} 命令：${command}；可用命令为 free、all、logout`, "warning");
        return;
      }
      await ui.refresh(ctx, { forceRefresh: true, showWhenInactive: true, showWidget: true });
    },
  });

  return {
    site,
    transformPayload(payload) {
      if (!site.payload.normalizeNamedToolChoice) return undefined;
      const parsed = asProviderPayload(payload);
      return parsed ? normalizeNamedToolChoice(parsed) : undefined;
    },
  };
}

export default async function (pi: ExtensionAPI) {
  const realms = [
    installRealm(pi, WORKBUDDY_INTL),
    installRealm(pi, WORKBUDDY_CN),
  ];
  const realmByProvider: Readonly<Record<string, RealmRuntime>> = Object.fromEntries(
    realms.map((realm) => [realm.site.providerId, realm]),
  );

  pi.on("before_provider_request", (event, ctx) => {
    const selected = ctx.model ? realmByProvider[ctx.model.provider] : undefined;
    return selected?.transformPayload(event.payload);
  });
}
