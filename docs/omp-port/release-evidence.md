# WorkBuddy OMP Release Evidence

Current status: **v1.2.0-rc.3 source candidate targets OMP 18.3.0; live two-realm acceptance and publication are not claimed.** Historical v1.2.0-rc.1 approval on OMP 18.2.7 remains recorded below; stable publication remains pending RC observation and final review.

This report contains redacted outcomes only. OAuth tokens, refresh tokens, Authorization values, account identifiers, organization identifiers, OAuth state values, and raw request bodies are intentionally omitted.

## OMP 18.3.0 compatibility addendum (2026-09-24)

OMP 18.3.0 removed the flat `AuthStorage.listOAuthAccounts`, `remove`, `invalidateUsageCache`, `fetchUsageReports`, and `resolver` methods. The 18.3.0 runtime exposes `oauth.accounts`, `credentials.remove`, `usage.invalidate`/`reports`, and `keys.resolver` instead. WorkBuddy migrated the Provider and UI paths; test credentials use the new namespace. No WorkBuddy OAuth, Gateway, or Billing protocol was changed. Provider single-account checks remain session-independent; UI account observations remain session-aware. This is a host API cutover, not evidence of live OAuth or request-identity binding on 18.3.0.

Local checks: `npm test` and `npm run test:fast` each passed 20/20 scripts; typecheck, OpenSpec strict and pack dry-run passed. An isolated real 18.3.0 AuthStorage probe verified namespaced credential CRUD, session-specific account `active`, resolver and Usage APIs. Official OMP 18.3.0 installed, diagnosed and uninstalled the candidate in an isolated profile; with existing authenticated state and the current extension explicitly loaded, Intl/CN Hy3 headless Chat returned their markers. The CN Read-tool path returned the exact package version; interactive `/workbuddy` showed available credits and `/workbuddy-cn` unavailable. The Intl Task tool ran, but its child model/identity was not independently recorded. A concurrent two-realm Chat probe exceeded its observation deadline and was stopped, so concurrency is not passed. Fresh OAuth, restart, forced refresh, scoped logout and the complete 18.3.0 release matrix remain unverified. The 18.2.7 AUTH-04 boundary is not revalidated. Detailed results and remaining gates: [`openspec/changes/upgrade-omp-18-3-auth-storage/evidence.md`](../../openspec/changes/upgrade-omp-18-3-auth-storage/evidence.md).

## Dual-realm M3 addendum

The 2026-09-21 M3 run completed fresh OAuth, restart, forced refresh, scope switching, concurrent Chat, cancellation, scoped logout, main/Task/headless, three real models per realm, reasoning budget edges, tools, vision, Billing/UI behavior, package lifecycle, and the permanent regression suite on official OMP `18.2.7`.

Functional gates passed for both `workbuddy` and `workbuddy-cn`. Credential/secret privacy and cross-realm isolation also passed: the inspected artifact contained no Authorization, access/refresh token, API key, credential, pending code, cross-realm identity, or third-party upload. OMP `18.2.7` did retain the request's raw `X-User-Id` in one host-owned local HTTP 400 dump. This is classified as a disclosed host-local privacy limitation, not an authentication-secret leak; README tells operators where these private local files live and how to handle them. The isolated acceptance profile and attachment were removed.

RC risk acceptance therefore approves `v1.2.0-rc.1`; stable publication remains pending RC observation and final review. The full redacted matrix, exact runtime baseline, observed MiniMax availability failure, exact Task models, cache checksums, and release decision are recorded in `openspec/changes/add-workbuddy-cn-realm/m3-evidence.md`.
The final local lifecycle check reported the `omp-workbuddy-connect` plugin itself as `ok` at `v1.2.0-rc.1`. OMP also emitted `package_manifest: warning — Not created yet` for the fresh isolated profile; install and uninstall still exited successfully. This host-profile warning is recorded rather than misreported as a completely warning-free doctor result.

## Historical v1 evidence

## Candidate and environment

| Field | Value |
|---|---|
| Test date | 2026-09-21 (UTC+08:00) |
| Host | macOS Darwin arm64 |
| OMP | `18.2.6` |
| Frozen OMP source commit | `78b753124d11f8dd3ae73e2524125890ff7c977e` |
| Extension manifest version | `1.1.5` |
| Acceptance execution base | `5ce20af5ee2822690ea2fa08ecbec41c11788346` |
| M5 tested working tree | Acceptance base plus the M5 changes documented in this report |
| Post-acceptance implementation commit | `4a6b328a56d73b0a8f43441aa261c2299a116a0b`; created after the live run and captures the tested production implementation |
| Release tag | `v1.1.5` → `655e9626c22ea4dfca90b26acd1c1585bdb0b2a3`; this post-release Bun prerequisite clarification is not included in the frozen tag |
| Node | `v26.9.0` |
| Bun | `1.3.14` |
| Account type | WorkBuddy international free subscription; identity redacted |
| Isolated profile | Dedicated M5 profile; removed after acceptance |
| Tested model IDs | `workbuddy/hy3`, `workbuddy/hy4-preview-f`, `workbuddy/deepseek-v4.1-flash` |

The extension was installed through the official host command, not only loaded by an SDK fixture:

```text
omp --profile <isolated> install . --json
name=omp-workbuddy-connect, version=1.1.5, enabled=true
```

Packaging declarations were checked independently of the actual installation:

```text
omp --profile <isolated> install . --dry-run --json
PASS: manifest name/version/extension declaration resolved

npm pack --dry-run --json
PASS: 12-entry artifact containing only package metadata, entrypoint, runtime source, README, and LICENSE
```

The GitHub distribution mechanism was verified before the release tag existed, using the immutable post-acceptance implementation commit:

```text
omp --profile <isolated> plugin install github:ha5h6r000wn/omp-workbuddy-connect#4a6b328a56d73b0a8f43441aa261c2299a116a0b --json
PASS: package v1.1.5 installed and enabled from GitHub

omp --profile <isolated> plugin doctor --json
PASS: plugin manifest and installation state healthy

omp --profile <isolated> plugin uninstall omp-workbuddy-connect --json
PASS: plugin removed; subsequent plugin list was empty
```

This verifies GitHub resolution, installation, discovery, health checks, and uninstall against the committed production implementation. The published `#v1.1.5` tag was subsequently installed, diagnosed, and uninstalled successfully with the same result. Both executions placed external Bun `1.3.14` on `$PATH`: OMP 18.2.6 Plugin Manager invokes `bun` for GitHub install/uninstall even when OMP itself is a compiled binary. The M5 OAuth/restart evidence used the same production implementation through an official local install.

## v1.1.6 Post-release UI Patch Evidence

`v1.1.6` points to `bf08c15223f0516f521534889ae14a98b467b574`. This patch changed only the optional management surface:

- no persistent WorkBuddy Widget or status line;
- no Billing request from `session_start`, `session_switch`, or `turn_start`;
- `/workbuddy` is the sole automatic Billing/detail entry and renders a compact command-scoped Widget;
- `/workbuddy free` and `/workbuddy all` perform the transactional scope change and emit a one-shot notification without Billing;
- the next `turn_start` clears detail and invalidates its generation, so a late Billing result cannot repaint UI;
- no timer or Chat/Auth/Provider/Gateway path was added.

| v1.1.6 verification | Result |
|---|---|
| `npm test` | PASS — 19/19 permanent regression scripts |
| `npm run typecheck` | PASS |
| Real OMP `18.2.6` TUI smoke | PASS — seven-line `/workbuddy` detail; no WorkBuddy status line |
| GitHub tag install | PASS — manifest version `1.1.6` |
| `omp plugin doctor --json` | PASS — plugin status `ok` |
| Isolated verification profile cleanup | PASS |

The M0–M5 Auth, Model, Gateway, Billing, Agent, and live-service evidence below is the frozen `v1.1.5` release record and is inherited because those paths did not change. Those live scenarios were not all re-executed solely for the UI patch. The `v1.1.5` Widget timing limitation below is historical and is superseded for `v1.1.6` by this command-scoped UI addendum.

### v1.1.7 Documentation and Compactness Polish

`v1.1.7` preserves the v1.1.6 runtime boundary and adds four scoped corrections: shared host Usage requests are described as display-invalidated rather than guaranteed network-cancelled; V2 and original lifecycle requirements now match command-scoped UI; the stale `session_start` comment is corrected; and the model row shows at most four names plus `… +N`.

Verification repeated on OMP `18.2.6`: `npm test` passed all 19 permanent scripts, `npm run typecheck` passed, and an isolated real TUI rendered the seven-line Widget with no WorkBuddy status line. The synthetic six-model UI regression rendered four names plus `… +2`. Auth, Provider, Gateway, and Chat production paths are unchanged and inherit the live evidence below.

### v1.1.8-rc.1 AUTH-04 reassessment

The sole-account optimization and zero duplicate OAuth resolution remain. Full transport inspection confirms Bearer-before-Header order and per-retry Header resolution, but a follow-up review found that `Model.resolveHeaders(signal)` receives no request session. The extension lifecycle's last `session_start`/`session_switch` session is not necessarily the main/Task/child session whose `AuthStorage.resolver()` selected the Bearer.

The rejected active-row implementation was additionally backed by a fake that ignored `sessionId`. It has been removed. Current code retains valid sole-row capture/recheck behavior and makes same-AuthStorage binding idempotent across sessions. A real AuthStorage regression now binds lifecycle session A, replaces A with B, resolves B for request session B, and confirms the retained model uses B without consulting session A's stale pin.

These checks are not an atomic Bearer/Header proof. The RC supports stable single-account use and serialized account replacement; a stable tag remains blocked until OMP provides request-scoped identity to Header resolution or the unsupported concurrent-mutation boundary is adopted as a permanent product constraint.

AUTH-04 is intentionally specified per transport attempt. A later retry may use a newly selected account after explicit replacement, but only if that retry's Bearer and Headers are atomically same-row; the current host gap prevents proving this condition.

RC operators must finish or cancel active WorkBuddy requests before account replacement, then use `/workbuddy logout` followed by `/login workbuddy`. Concurrent replacement from another OMP session or process is outside the RC support contract.

RC verification on OMP dependencies `18.2.6`: `bun test/run-all.mts` passed 19/19 scripts, `bun run typecheck` passed, strict OpenSpec validation passed, and `npm pack --dry-run --json` produced `omp-workbuddy-connect@1.1.8-rc.1` with the expected 12-file runtime artifact.

## Release Matrix

| Domain / case | Result | Execution evidence | Implementation / durable evidence |
|---|---|---|---|
| Install / OMP 18.2.6 load | PASS | Official `omp install . --json` enabled `./extensions` in an isolated profile; interactive and print sessions loaded it | `package.json`; `extensions/workbuddy.ts` |
| Type / zero errors | PASS | `npx tsc --noEmit`, exit 0 | `tsconfig.json`; all production and test modules |
| Login / fresh OAuth | PASS | Official international login page opened; one host OAuth row was persisted; no token was printed or copied | `src/auth.ts`; `src/workbuddy-api.ts`; OAuth protocol regression |
| Auth / first request identity | PASS (serial only) | First request confirms Bearer-before-Header order and matching observed identity | Does not prove mutation between the two callbacks |
| Restart / credential recovery | PASS | Interactive OMP process stopped, restarted on the same isolated profile, and returned `RESTART_AUTH_OK` without login | persisted-credential restart regression |
| Refresh / expired access | PASS | Expiry was forced through public `AuthStorage`; the next real Hy3 request returned `REFRESH_LIVE_OK`; the persisted expiry became future-dated | `refreshWorkBuddyOAuth`; request-identity regression |
| Failure / invalid refresh | PASS | An isolated real host row was expired with an invalid refresh value; actual headless invocation failed before Chat and stored no successful replacement | OAuth protocol regression; fail-closed provider checks |
| Identity / missing accountId | PASS | accountId was removed from an isolated host row; actual headless model resolution returned no WorkBuddy model and made no Chat request | `validateStoredCredential`; provider regression |
| Identity / optional org / no-enterprise | PASS | The live international account has no enterprise identity; login, refresh, and streamed Chat passed on the no-enterprise path | `X-No-Enterprise-Id` request-bound resolver; M1 redacted live evidence |
| Switch / A → B | PASS serial / BLOCKED atomic | Retained model resolves B through a second request session while lifecycle binding remains A; shared AuthStorage rebinding is stable | No request session reaches `resolveHeaders`, so concurrent Bearer/Header atomicity is unproven |
| Logout / credential invalid | PASS | `/workbuddy logout` left zero WorkBuddy OAuth rows; subsequent real headless invocation failed before transport | provider logout regression |
| Chat / three real models | PASS | Hy3, Hy4 preview, and Deepseek-V4.1-Flash each returned their unique live marker | model catalog and native transport regressions |
| Thinking / supported effort | PASS | Hy3 headless high effort emitted a streamed thinking block and result; Hy4 high and Deepseek high completed real requests | canonical `thinking` metadata; model-transport regression |
| Vision / real image | PASS | Hy3 received a generated 2×2 red PNG and returned `IMAGE_LIVE_OK:red` | model `input: [text,image]`; model-transport regression |
| Tools / read, grep, bash | PASS | Real main Hy3 invoked each OMP tool and consumed its result; markers and package data matched | M3 tool-loop regression |
| Tools / sequential and multi | PASS | Real main Hy3 performed read followed by bash only after the first result; a separate turn issued independent read+bash calls in one turn | tool-loop regression covers named, sequential, parallel, correlation, and final answer |
| Agent / main | PASS | Interactive Chat, thinking, streaming, Billing, and tools completed | extension composition root |
| Agent / Task role | PASS | `modelRoles.task=workbuddy/hy3`; actual Task agent used read and yielded `TASK_LIVE_OK:omp-workbuddy-connect` after three model requests | actual Task runtime contract regression |
| Runtime / headless | PASS | `omp -p` loaded OAuth, model, payload hook, streaming, thinking, read tool, result, and clean exit without TUI | headless/UI regression |
| Scope / free | PASS | Live command projected exactly the three cache rows with explicit zero multipliers | `freeModelIds`; model-scope lifecycle regression |
| Scope / all | PASS | Live command re-registered 22 valid cache rows and kept Chat/UI operational | scope transaction implementation and regression |
| Scope / empty free | PASS | Real OMP registry integration clears stale rows for authoritative empty free scope and blocks retained model transport | model-scope lifecycle regression |
| Billing / success | PASS | Official Billing returned a nonzero total and two plan names; exact values omitted from evidence | `createWorkBuddyUsageProvider`; credits regression |
| Billing / 5xx | PASS (controlled fault) | Production UsageProvider through real AuthStorage returned unavailable and did not retain last-good data when its HTTP boundary received 5xx | credits regression |
| Billing / timeout / slow | PASS (controlled fault) | Production UsageProvider timed out promptly; delayed startup remained non-blocking; stale completion could not repaint | credits, session-start, and UI regressions |
| Isolation / other provider | PASS | Real OMP hooks and catalog tests preserve foreign provider rows and same-ID payloads exactly; WorkBuddy resolver/header logic is provider-bound | provider, scope, and before-provider-request regressions |
| Logging / no credential leakage | PASS | Production source and runtime output were inspected; no token, refresh value, or Authorization value is emitted. Extension Widget identity is masked, and committed evidence contains no raw identity or OAuth state | `redactIdentity`; source/file/network audit below |

Controlled HTTP faults are deterministic executions of the production UsageProvider through OMP AuthStorage; they are not claims that the official service happened to fail during the live positive Billing call. The positive OAuth, Chat, Refresh, Vision, Tools, Credits, main, Task, and headless paths above all used the official service.

## Four verification layers

| Layer | Coverage | Result |
|---|---|---|
| Unit | auth mapping, OAuth protocol, payload, model catalog, transport parsing, settings, credits, UI state | PASS |
| OMP contract | ProviderConfig/OAuth callbacks, model modifier, request hook, provider logout, request-bound identity | PASS |
| OMP integration | official extension loading, registry replacement, persisted restart, scope lifecycle, actual Task executor, headless lifecycle | PASS |
| WorkBuddy Live E2E | OAuth, Chat, refresh, three models, thinking, image, read/grep/bash, sequential/multi tools, Billing, main, Task role, headless, free/all, logout | PASS |

`test/run-all.mts` sequentially executed 19 permanent regression scripts and reported `OK: 19 permanent regression scripts passed`. The scripts collectively retain all twelve V2 §13 behavior classes: isolation, cancellation, identity fail-closed, refresh, account switch, restart, dynamic scope, payload compatibility, streamed tool association, Credits failure semantics, UI stale-result suppression, and headless/Task lifecycle. Fixtures use temporary AuthStorage/config paths and are removed in `finally`; they do not read the live profile or Desktop credentials.

## Security, file, and network inspection

- Production URLs are derived only from `https://www.workbuddy.ai`: plugin state/token/refresh, Chat base `/v2`, and Billing `/v2/billing/meter/get-user-resource`.
- The server-returned browser authorization URL is rejected unless its parsed origin is exactly `https://www.workbuddy.ai` and it contains no URL credentials.
- No loopback proxy, custom Chat transport, global fetch interception, secondary credential store, or third-party upload exists.
- Tokens are passed only through OMP OAuth callbacks and request headers. Errors describe missing fields/status classes, never values. Login diagnostics expose response/claim key names only.
- Project scans found no `.env`, auth database, credential file, token dump, or runtime log artifact.
- The only Desktop path read by production is model metadata at `~/.workbuddy-ai/cache/acc-product-config-v3.json`; no Desktop credential path exists in production code.
- The Desktop product metadata SHA-256 was identical before and after logout: `f8805736077d73549ef88f6615b7e246a6548b311f1b526c0c673ea020e89027`.
- `/workbuddy logout` removed only OMP's WorkBuddy credential. The isolated profile ended with zero WorkBuddy rows.
- OMP's local interactive login confirmation prints the authenticated account identity to that user, and its login dialog displays the short-lived OAuth state URL. The extension does not duplicate either value into its own diagnostics; its Widget masks identity. Raw terminal capture is therefore not committed, and this report retains only redacted outcomes.

## Requirement → implementation → evidence

| Requirement | Implementation | Evidence |
|---|---|---|
| REL-01 runtime parity | `extensions/workbuddy.ts`, `src/provider.ts`, `src/payload.ts` | main, Task role, headless live rows above; Task/headless regressions |
| REL-02 complete matrix | M0–M4 production modules plus M5 candidate | every Release Matrix row above |
| REL-03 four layers | `test/run-all.mts`, 19 permanent scripts | four-layer table and successful runner output |
| REL-04 privacy/endpoints | `src/workbuddy-api.ts`, `src/auth.ts`, `src/ui.ts`, host AuthStorage-only provider | source/log/file/network audit and unchanged Desktop checksum |
| REL-05 reproducibility | this report; frozen baseline and ADR documents | exact versions, commits, date, account type, model IDs, matrix, limitations |
| REL-06 honest limits | `README.md`, ADRs, this report | installation, migration, cache/scope, single-account and UI timing disclosures |

Detailed AUTH/MODEL/GATE/UX mappings remain in `docs/omp-port/requirement-implementation-test-matrix.md`; M5 changes update its REL rows rather than duplicating all earlier evidence here.

## v1.1.5 Historical Known Limitations

1. Officially verified only on OMP `18.2.6` and WorkBuddy international `https://www.workbuddy.ai`.
2. Exactly one stored WorkBuddy account is supported. Zero/multiple rows, missing identity, or identity mismatch fail closed; no credential rotation is attempted.
3. Historical v1.1.5 UI: Widget/status could update on the next `turn_start` after model selection. Superseded by the v1.1.6 command-scoped UI addendum above.
4. Dynamic model metadata comes from the Desktop product cache. Builtin fallback supports `all` only; it is not free evidence.
5. v1 does not import Desktop credentials, add a custom Provider transport, use an online dynamic-catalog endpoint, or provide immediate model-selector UI refresh.
6. OMP 18.2.6 exposes aggregate usage refresh. The historical v1.1.5 Widget filtered to WorkBuddy after the host fetch; v1.1.6+ performs the same filtering only for explicit `/workbuddy`. Another configured provider may also refresh when its usage cache expires.
7. v1 distribution is intentionally GitHub-tag-only. OMP Marketplace catalog publication and npm registry publication are deferred.
8. GitHub install and uninstall require an external `bun` executable on `$PATH` because OMP 18.2.6 Plugin Manager shells out to Bun. This prerequisite belongs to the host distribution path, not the extension runtime.
