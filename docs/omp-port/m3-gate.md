# M3 Gateway Compatibility Gate

Recorded: 2026-09-20  
Host: OMP 18.2.6  
Status: **PASS**

## Local implementation result

Tasks 4.1–4.7 are complete:

- only one WorkBuddy-specific payload transform remains, backed by a redacted live Gateway failure;
- `src/payload.ts` is otherwise a copy-on-write compatibility boundary;
- the actual extension hook uses the request-bound `ctx.model.provider`, leaves current/historical same-ID foreign payloads unchanged, and changes only WorkBuddy named `tool_choice`;
- active scope, transition, and retained-model fail-closed checks live in WorkBuddy `resolveHeaders`, after host credential selection but before the prior resolver and HTTP transport;
- reasoning, ordinary content, tool calls, `tool_call_id`, and tool results survive the native Agent loop;
- a synthetic standard-capability model completes named/auto, fragmented-argument, sequential and same-turn parallel tool calls through the real OMP Agent;
- the real OMP `openai-completions` implementation owns reasoning/text/tool streaming, usage, `[DONE]`, HTTP diagnostics, abort, and Retry-After-aware retry;
- the plugin contains no Chat client, SSE/tool parser, retry loop, or global Chat fetch interceptor.

Synthetic capability fixtures prove the OMP 18.2.6 host contract. The isolated live run separately proved WorkBuddy behavior.

## Compatibility decisions

Reasoning cleanup, request-body token clamp, forced stream, developer/system rewrite, unsupported-field cleanup, and automatic system prompts remain deleted because no Gateway failure was observed. Native named forcing on `deepseek-v4.1-flash` produced a redacted HTTP 400/code `11101`: the Gateway could not unmarshal the OpenAI named-choice object into its string `tool_choice` field.

The retained correction is deliberately narrow: when the request-bound Model provider is `workbuddy`, copy the payload and replace `{type:"function", function:{name}}` with `name`. Existing string choices and all other fields remain untouched. The hardened Provider-routed hook completed the isolated Deepseek `/force:read` case with one real `Read package.json` and `DEEP_NAMED_TOOL_OK`.

No production `supportsDeveloperRole`, `supportsForcedToolChoice`, or `supportsNamedToolChoice` override was added. OMP generated the native named object; the plugin adapts only the evidenced Gateway wire difference.

## Local verification

The following completed with exit code 0 after restoring test-owned environment variables and directory caches:

```text
package.json peer/dev host pins                 -> OMP 18.2.6
npx bun test test                              -> 17 script files completed, 0 failures
npx bun extensions/workbuddy.ts --self-check  -> ok
npx tsc --noEmit                               -> no diagnostics
npx openspec validate adapt-workbuddy-international-omp --strict
                                                -> valid
```

The repository tests are executable `.test.mts` contract scripts rather than `bun:test` declarations, so Bun reports zero formal test cases; their seventeen explicit `OK:` contracts and process exit status are the acceptance signal. Plain `bun test test` succeeds without cross-file environment leakage.

> Erratum (2026-09-21): `bun test <dir>` runs every discovered file in **one** process, sequentially (bun 1.3.14 probe: four files logged the same `pid`, 526 ms apart, and a `globalThis`/`process.env` value written by the first file was observed by the other three). The isolation behind the 17/17 result therefore comes from the scripts restoring test-owned state in `finally`, not from Bun's runner. Per-script process isolation requires `npm test` (`test/run-all.mts`), which spawns one Bun process per script.

## Request-bound isolation

OMP 18.2.6 passes the exact request Model to `before_provider_request` as `ctx.model`. The hook gates only on `ctx.model.provider === "workbuddy"`; current and historical same-ID foreign Providers are unchanged. The host catches ordinary hook exceptions and continues with the original payload, so the hook cannot enforce fail closed. WorkBuddy model `resolveHeaders` owns active-scope, transition, and revision checks. On the authenticated `streamSimple()` path, host credential selection precedes that resolver; invalid retained models still stop before the previous resolver and HTTP transport.

## Task 4.7 — live acceptance

The unpublished source was loaded directly:

```bash
omp --profile workbuddy-m3-live \
  --no-extensions \
  --extension /absolute/path/to/omp-workbuddy-connect/extensions/workbuddy.ts
```

The isolated run completed:

1. `/login workbuddy`, `/workbuddy all`, and selection from the 22-model Desktop catalog;
2. Hy3 ordinary chat and a two-turn reasoning-history continuation;
3. Hy3 single-tool, strictly sequential two-tool, and same-turn two-tool execution;
4. user Escape abort followed by a successful turn in the same session;
5. Deepseek-V4.1-Flash reasoning and automatic tool execution;
6. Deepseek native named-force failure, minimal compatibility correction, extension reload, and successful forced `read`;
7. `/logout workbuddy`, followed by AuthStorage inspection showing the sole row disabled as `deleted by user` and zero enabled WorkBuddy credentials.

Fragmented tool arguments, exact correlation, generic non-2xx propagation, Retry-After handling, retry ownership, and SSE terminal behavior remain native OMP contract evidence. The live service was not intentionally damaged to manufacture 4xx/5xx behavior; the named-choice failure occurred naturally during the required case.

After request-bound Provider routing and resolver-owned fail-closed scope checks were implemented, a fresh isolated login repeated the exact Deepseek forced named-tool path. OMP selected `workbuddy/deepseek-v4.1-flash`, executed one real `Read package.json`, returned `DEEP_NAMED_TOOL_OK`, and showed no code `11101` or HTTP 400. The account was logged out again and the isolated credential was removed.

The evidence is redacted: no account ID, token, authorization value, OAuth state, or request ID is recorded.
