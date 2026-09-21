import type { AuthStorage, Model, OAuthCredentials, UsageCredential } from "@oh-my-pi/pi-ai";
import type { ExtensionContext, ProviderConfig } from "@oh-my-pi/pi-coding-agent";
import { loginWorkBuddy, refreshWorkBuddyOAuth, validateRequestCredential, validateStoredCredential } from "./auth.ts";
import { createWorkBuddyUsageProvider } from "./credits.ts";
import { chatBaseUrl, fixedChatHeaders, type SiteDescriptor } from "./site.ts";

type StoredAuth = Pick<AuthStorage, "listOAuthAccounts" | "remove">;
type ProviderModels = NonNullable<ProviderConfig["models"]>;
type Fetch = typeof globalThis.fetch;

interface RuntimeBinding {
  authStorage: StoredAuth;
}

function identityError(site: SiteDescriptor, reason: string): Error {
  return new Error(
    `${site.providerId} authentication rejected: ${reason}; keep exactly one account and run /login ${site.providerId} again`,
  );
}

function requireSingleStoredAccount(site: SiteDescriptor, binding: RuntimeBinding) {
  const accounts = binding.authStorage.listOAuthAccounts(site.providerId);
  if (accounts.length !== 1) throw identityError(site, `expected one stored account, found ${accounts.length}`);
  const account = accounts[0]!;
  if (!account.accountId) throw identityError(site, "stored account identity is incomplete");
  return account as typeof account & { accountId: string };
}

function optionalIdentity(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function validateCredentialIdentity(
  site: SiteDescriptor,
  binding: RuntimeBinding,
  credentials: OAuthCredentials,
): void {
  const account = requireSingleStoredAccount(site, binding);
  if (
    account.accountId !== credentials.accountId
    || optionalIdentity(account.orgId) !== optionalIdentity(credentials.orgId)
  ) {
    throw identityError(site, "selected credential does not match the stored account identity");
  }
}


export interface WorkBuddyProviderController {
  bindContext(context: ExtensionContext): void;
  setModelAccess(activeIds: ReadonlySet<string>, transitioning: boolean): void;
  config(models: ProviderModels): ProviderConfig;
  logout(): Promise<void>;
  shutdown(): void;
}

export function createWorkBuddyProvider(site: SiteDescriptor, fetcher: Fetch = globalThis.fetch): WorkBuddyProviderController {
  let binding: RuntimeBinding | undefined;
  let authenticationEnabled = true;
  const lifecycleAbort = new AbortController();
  let authenticationAbort = new AbortController();
  let modelAccess = {
    activeIds: new Set<string>(),
    transitioning: true,
    revision: 0,
  };

  function requireModelAccess(modelId: string, expectedRevision?: number): number {
    if (modelAccess.transitioning) {
      throw new Error(`${site.label} model "${modelId}" is unavailable while its scope is changing`);
    }
    if (!modelAccess.activeIds.has(modelId)) {
      throw new Error(`${site.label} model "${modelId}" is outside the active scope; select an available model`);
    }
    if (expectedRevision !== undefined && modelAccess.revision !== expectedRevision) {
      throw new Error(`${site.label} model "${modelId}" scope changed during request`);
    }
    return modelAccess.revision;
  }

  function combinedSignal(signal?: AbortSignal): AbortSignal {
    const signals = [lifecycleAbort.signal, authenticationAbort.signal];
    if (signal) signals.push(signal);
    return AbortSignal.any(signals);
  }

  function requireBinding(): RuntimeBinding {
    if (!binding || !authenticationEnabled || lifecycleAbort.signal.aborted) {
      throw identityError(site, "session authentication is not initialized");
    }
    return binding;
  }

  function getApiKey(credentials: OAuthCredentials): string {
    validateRequestCredential(site, credentials);
    validateCredentialIdentity(site, requireBinding(), credentials);
    return credentials.access;
  }

  function modifyModels(models: Model[], credentials: OAuthCredentials): Model[] {
    try {
      validateStoredCredential(site, credentials);
      if (binding) validateCredentialIdentity(site, binding, credentials);
    } catch {
      return models.filter((model) => model.provider !== site.providerId);
    }

    return models.map((model) => {
      if (model.provider !== site.providerId) return model;
      const previous = model.resolveHeaders;
      return {
        ...model,
        resolveHeaders: async (signal?: AbortSignal) => {
          const accessRevision = requireModelAccess(model.id);
          const requestSignal = combinedSignal(signal);
          const currentBinding = requireBinding();
          const selectedAccount = requireSingleStoredAccount(site, currentBinding);
          const preserved = await previous?.(requestSignal);
          requestSignal.throwIfAborted();
          requireModelAccess(model.id, accessRevision);
          if (requireBinding() !== currentBinding) {
            throw identityError(site, "authentication storage changed during header resolution");
          }
          const currentAccount = requireSingleStoredAccount(site, currentBinding);
          if (
            currentAccount.credentialId !== selectedAccount.credentialId
            || currentAccount.accountId !== selectedAccount.accountId
            || optionalIdentity(currentAccount.orgId) !== optionalIdentity(selectedAccount.orgId)
          ) {
            throw identityError(site, "stored account changed during header resolution");
          }
          return {
            ...preserved,
            "X-User-Id": selectedAccount.accountId,
            ...(selectedAccount.orgId
              ? { "X-Enterprise-Id": selectedAccount.orgId }
              : { "X-No-Enterprise-Id": "1" }),
          };
        },
      };
    });
  }

  function validateBillingCredential(credential: UsageCredential): void {
    const currentBinding = requireBinding();
    const account = requireSingleStoredAccount(site, currentBinding);
    if (
      credential.type !== "oauth"
      || !credential.accessToken
      || !credential.accountId
      || credential.accountId !== account.accountId
      || optionalIdentity(credential.orgId) !== optionalIdentity(account.orgId)
    ) {
      throw identityError(site, "Billing credential does not match the sole stored account");
    }
  }

  const usage = site.usage.enabled ? createWorkBuddyUsageProvider(site, validateBillingCredential) : undefined;

  return {
    bindContext(context) {
      const authStorage = context.modelRegistry.authStorage;
      if (binding?.authStorage === authStorage) return;
      binding = { authStorage };
    },
    setModelAccess(activeIds, transitioning) {
      modelAccess = {
        activeIds: new Set(activeIds),
        transitioning,
        revision: modelAccess.revision + 1,
      };
    },
    config(models) {
      return {
        baseUrl: chatBaseUrl(site),
        api: "openai-completions",
        headers: fixedChatHeaders(site),
        ...(usage ? { usage } : {}),
        oauth: {
          name: site.displayName,
          login: async (callbacks) => {
            const credentials = await loginWorkBuddy(site, {
              ...callbacks,
              signal: combinedSignal(callbacks.signal),
            }, fetcher);
            authenticationEnabled = true;
            return credentials;
          },
          refreshToken: (credentials: OAuthCredentials, signal?: AbortSignal) => refreshWorkBuddyOAuth(
            site,
            credentials,
            fetcher,
            Date.now(),
            combinedSignal(signal),
          ),
          getApiKey,
          modifyModels,
        },
        models,
      };
    },
    async logout() {
      if (!binding) throw identityError(site, "session authentication is not initialized");
      const wasEnabled = authenticationEnabled;
      authenticationAbort.abort(`${site.label} logout`);
      authenticationAbort = new AbortController();
      try {
        await binding.authStorage.remove(site.providerId);
        authenticationEnabled = false;
      } catch (error) {
        authenticationEnabled = wasEnabled;
        throw error;
      }
    },
    shutdown() {
      authenticationEnabled = false;
      binding = undefined;
      lifecycleAbort.abort(`${site.label} extension shutdown`);
      authenticationAbort.abort(`${site.label} extension shutdown`);
    },
  };
}
