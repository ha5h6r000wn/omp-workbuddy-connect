# 中国站 Realm M0 证据与准入结论

记录时间：2026-09-21

## 1. 结论

**M0 准入状态：PASS；生产发布状态：仍未批准。** 当前证据已冻结中国站官方客户端的目录来源、核心 OAuth 路由、refresh、stream-only Chat 约束、隔离探针成功使用的 Chat URL 与最小 header 集合，并用授权账号完成不落盘 credential 的 live probe。Chat URL/header 目前属于“隔离探针已观察”，不是官方 OMP 出站抓包确认的生产常量；3.6 前必须用脱敏 OMP 请求记录复核。Provider 客户端的拒绝、超时、429、取消、restart 与 logout 已移入 3.2/4.2，在这些发布 gate 通过前不得注册生产 `workbuddy-cn`。

因此：

- 生产入口继续只注册国际站 `workbuddy`。
- 不写入或猜测 `workbuddy-cn` endpoint/header/credential 常量。
- 中国站不注册 UsageProvider，不发 Billing 请求。
- 中国站不提供 builtin catalog fallback；后续只能读取经验证的中国站来源，失败时报告 unavailable/empty。
- 模型与价格以 `(providerId, modelId)` 为身份；同 ID 不跨站复用能力、预算、价格或免费结论。

## 2. 证据等级与脱敏规则

| 等级 | 含义 |
|---|---|
| 已观察（运行时） | 官方客户端日志或本地缓存记录了实际运行结果。 |
| 已观察（静态） | 官方安装包内的产品配置或执行代码明确包含该值。 |
| 推断 | 多份证据方向一致，但未看到目标 OMP 请求的脱敏网络记录。不得写入生产 descriptor。 |
| 未知 | 没有足以支持实现或发布的证据。 |

本文不记录 token、Authorization、refresh token、state、loginSessionId、用户 ID、设备 ID或账号昵称。运行日志中的这些字段只用于确认字段存在，写入本文时全部省略或替换为 `<redacted>`。

## 3. 可复现基线

### 3.1 仓库与版本

| 项目 | 值 |
|---|---|
| 分支 | `main`，记录时与 `origin/main` 无 tracked 差异 |
| HEAD | `5b99940544f91c281704f67019f192e9b442fead` |
| 扩展包 | `omp-workbuddy-connect@1.1.8-rc.3` |
| 仓库 OMP 依赖 | `@oh-my-pi/* 18.2.6` |
| 已安装 `omp` CLI | `omp/18.2.7`，路径 `/opt/homebrew/bin/omp` |
| Node / Bun | `v26.9.0` / `1.4.2` |
| 中国站 Desktop | `5.5.6`，commit `5f9692923c93033111c51ad7b003eb80204a9b75` |
| 国际站 Desktop | `5.5.2`，commit `910352f030ae2d11d8a21c21929fa4d1b4eeedd7` |

### 3.2 国际站回归结果

- `npm run typecheck`：通过。
- `npm test`：通过，19 个串行永久回归脚本全部通过。
- 当前 HEAD 真实国际站冒烟：在新隔离 profile `workbuddy-m0-intl-20260921` 完成 `/login workbuddy`；退出交互进程后以持久化宿主 credential 运行 `workbuddy/hy3`，3.83 秒返回精确文本 `INTL_M0_OK`，证明 restart/headless/Chat streaming 路径可复现。
- 验证后执行 `/workbuddy logout`，OMP 显示已断开登录；没有读取、复制或输出 credential。
- `docs/omp-port/release-evidence.md` 保存了更完整的历史国际站 OAuth/Chat/工具/Usage 矩阵，本次 smoke 补齐当前 HEAD 的最小真实回归。

M0 1.1 的版本、类型、永久测试与当前真实国际站 smoke 均已复现。

## 4. 中国站协议证据矩阵

证据源：

1. 官方中国站产品配置：`/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/product.json`，SHA-256 `d210ac49e27209484101d9bf1f131a6a1e3cbdcd79ea3e14d16043ff6767d7b8`。
2. 官方中国站 CLI bundle：同安装包 `cli/dist/codebuddy.js`。
3. 官方中国站运行日志：`~/.workbuddy/logs/`，仅引用已脱敏字段形状。
4. 中国站运行缓存：`~/.workbuddy/cache/acc-product-config-v3.json`，SHA-256 `fc0782468bcb777781c5f37814be44ff8413545845acbdb025dd7eb1a9fe8245`。

| 项目 | 值/形状 | 状态 | 依据与限制 |
|---|---|---|---|
| API endpoint | `https://copilot.tencent.com` | 已观察（静态+运行时） | 官方产品配置的 `endpoint`；日志实际访问 `https://copilot.tencent.com/v3/config`。 |
| Web login URL | live start 返回 `https://copilot.tencent.com/login?...`；Desktop 实际打开 `https://www.workbuddy.cn/login?...` | 已观察（运行时） | 官方客户端会 decorate auth URL；域名不是可硬编码为单一值的证据。所有 state/session 参数均已脱敏。 |
| Auth prefix/platform | `/plugin` / `workbuddy` | 已观察（静态） | `authentication.attributes.prefixPath` 与 `platform`。 |
| login-start | `POST https://copilot.tencent.com/v2/plugin/auth/state?platform=workbuddy`，body `{}` | 已观察（静态+live） | 2026-09-21 无 credential 探针返回 HTTP 200、业务码 0。 |
| login-start headers | `X-No-Authorization: true`、`X-No-User-Id: true`、`X-No-Enterprise-Id: true`、`X-No-Department-Info: true` | 已观察（静态） | 官方 bundle；布尔值按字符串发送。 |
| login-start response | raw envelope keys `code/data/msg/requestId`；`data` keys 为 `state/authUrl` | 已观察（live） | state 为 36 字符但未记录；返回 auth URL 的 query keys 只有 `platform/state`。 |
| poll | `GET https://copilot.tencent.com/v2/plugin/auth/token?state=<redacted>` | 已观察（静态+live） | 使用同一组四个 `X-No-*` headers；未授权探针返回 HTTP 200。 |
| pending | raw envelope keys `code/msg/requestId`，错误码 `11217`，无 `data` | 已观察（live） | 与官方 bundle 枚举 `RetryFetchToken` 一致。 |
| poll cadence/deadline | 1 秒；5 分钟 | 已观察（静态） | 官方 bundle 常量 `1000` / `300000`；尚未在 OMP 实测。 |
| cancellation | AbortController 中止 poll 并抛取消错误 | 已观察（静态） | 官方 bundle 控制流；尚未在 OMP 实测。 |
| refresh | `POST https://copilot.tencent.com/v2/plugin/auth/token/refresh`，body `{}` | 已观察（静态+live） | HTTP 200/业务码 0；返回新 access/refresh 与 expiry 字段。 |
| refresh headers | `X-Refresh-Token: <redacted>`、`X-Auth-Refresh-Source: plugin`、`X-Domain: <token-domain>` | 已观察（live） | 成功响应；关键差异是不能沿用当前国际站实现的 `workbuddy` refresh source。 |
| current account | `GET https://copilot.tencent.com/v2/plugin/account`，Bearer access token 与 token domain | 已观察（live） | HTTP 200/业务码 0；raw `data` 含 durable `uid`、type、pluginEnabled 等，值不记录。 |
| token fields | `accessToken/domain/expiresIn/refreshExpiresIn/refreshToken/scope/sessionState/tokenType` | 已观察（live） | 只记录 key 与存在性；credential 全程在内存，验证后重置运行时销毁。 |
| auth reject | 非 `11217` poll 错误终止 | 已观察（静态） | 具体中国站业务码与用户文案未知。 |
| HTTP 429 | 未知 | 未知 | 没有真实响应与 Retry-After 证据；不通过压测故意触发。 |
| Chat endpoint candidate | `POST https://copilot.tencent.com/v2/chat/completions` | 已观察（隔离 live） | 同一授权探针中，非 stream 返回 HTTP 400/业务码 11101，`stream:true` 返回 HTTP 200 SSE。该完整 URL 是成功探针事实，但尚非官方 OMP/官方客户端请求记录确认的生产常量；3.6 前必须复核。 |
| Chat Origin/Referer | 隔离 live probe 均未发送 | 已观察（隔离 live） | 授权 Chat 成功，只能证明该最小探针不依赖浏览器 Origin/Referer；不能证明官方客户端不会发送，生产 descriptor 仍需脱敏 OMP 请求记录核对。 |
| Chat headers candidate | Bearer、URL-encoded `X-User-Id`、`X-No-Enterprise-Id: 1`、token 返回的 `X-Domain`、`X-Product: SaaS`、`X-Requested-With: XMLHttpRequest` | 已观察（隔离 live） | 使用该集合成功完成 Chat；只记录 header 名与来源，所有身份值已脱敏。成为生产常量前仍需 OMP 出站复核。 |
| Chat response | SSE `data:` events + `[DONE]`；delta 有 content/reasoning/tool_calls，usage 有 numeric credit | 已观察（隔离 live） | `fast-model` 在 `max_tokens=64` 时 reasoning 消耗输出预算并以 `finish_reason=length` 截断、content 为空；提高到 256 后 `finish_reason=stop`，最终文本精确为 `CN_M0_OK`。实现不得丢弃 reasoning，也不得把低预算截断误判为空响应。 |
| Catalog | `GET https://copilot.tencent.com/v3/config`；落盘 `~/.workbuddy/cache/acc-product-config-v3.json` | 已观察（运行时） | 官方日志记录 fetch success，缓存包含 50 个模型。 |
| Billing endpoint/headers/body | 未知 | 未知 | 未发现足以批准 UsageProvider 的中国站契约证据。 |
| 国际站 fallback | live probe 仅请求 `copilot.tencent.com` | 已观察（本探针） | 尚未在生产 OMP CN Provider 中证明，因此生产 CN Provider 仍保持未注册。 |

### 4.1 与当前国际站实现的已知不同点

- endpoint：国际站 `https://www.workbuddy.ai/v2`；中国站官方产品 endpoint 为 `https://copilot.tencent.com`，auth 组合为 `/v2/plugin/...`。
- platform：国际站 `workbuddy-ai`；中国站 `workbuddy`。
- refresh source：当前扩展国际站发送 `X-Auth-Refresh-Source: workbuddy`；中国站官方 CLI 发送 `plugin`。
- polling：当前扩展国际站实现为 2 秒、15 分钟；中国站官方 CLI 静态实现为 1 秒、5 分钟。
- Login Web domain：中国站运行时使用 `www.workbuddy.cn`；不能把它当作 API base。

这些差异禁止通过替换一个 base URL 来接入中国站。

## 5. 认证 live gate

官方 Desktop 日志证明 2026-09-19 曾完成一次中国站 external-link 登录。2026-09-21 的脱敏 live probe 进一步完成：

- 无 credential start 与 pending：HTTP 200/业务码 0，随后 HTTP 200/业务码 11217；
- 用户授权成功：第二次 poll 在 1 秒内返回业务码 0，包含 access/refresh/domain/expiry 字段；
- current account：HTTP 200/业务码 0，返回 durable uid；
- refresh：HTTP 200/业务码 0，access 与 refresh 均返回；
- Chat：确认隔离探针中的 `/v2/chat/completions` 只支持 stream；SSE reasoning/content/usage/[DONE] 完整。`fast-model` 在 64 token 输出预算下 reasoning 被 `length` 截断且 content 为空，在 256 下最终返回 `CN_M0_OK`；完整 URL/header 仍须由脱敏 OMP 出站记录复核后才能成为生产常量；
- 探针只访问 `copilot.tencent.com` API；credential 不落盘，完成后通过重置 JS runtime 销毁。

探针只输出 envelope key、状态码、字段存在性和非敏感模型响应，不输出 state、URL 参数值、token、uid、domain 值或账号数据。

### 5.1 M2 前置身份决策

- **domain restart recovery：未闭环，属于 M2 生产装配 blocker。** CN token/refresh response 的 `domain` 是 Chat/refresh 的 `X-Domain` 来源；当前 OMP `OAuthCredentials` 没有专用 `domain` 字段。不得把值写入插件自建 credential 文件，也不得在没有语义证据时挪用 `enterpriseUrl`、`apiEndpoint` 等宿主字段。3.2 必须证明：要么宿主支持的 credential 字段能按原语义持久化并在 restart 后恢复该值，要么用只记录 claim keys 与相等性、不记录 claim values 的脱敏 probe 验证 `hostname(jwt.iss) === token-domain`，再允许从同一 access token 确定性恢复；该等式目前不是事实。两条路径都失败则 CN Provider 不进入生产装配。
- **durable uid authority：当前以 `/v2/plugin/account` 的 `data.uid` 为权威。** poll token response 没有已观察的 durable uid，因此 CN login 必须在 token success 后完成 account finalize，再构造并交付 OMP OAuth credential。JWT `uid`/`sub` 只有在独立验证其与 account uid 一致后才能作为 restart reconstruction 候选；probe 只允许记录 claim key 和相等性，不记录 claim value。refresh 默认保留已持久化 `accountId`，发现身份矛盾时 fail closed。
- 上述两项不否定 M0 对服务协议的准入结论，但在 3.2 验证通过前禁止生产 `workbuddy-cn` 注册。

后续 3.2/4.2 必须覆盖：

- 隔离 OMP `workbuddy-cn` Provider 的 credential 持久化、restart 与 logout 清理；
- 用户拒绝、超时、HTTP 429/Retry-After 和主动取消；
- 官方客户端完整 Chat header 对照；
- 另外两个候选模型及工具/vision 验收。

验收拆分理由：M0 的职责是冻结真实服务协议；在 Provider 尚未实现时要求 OMP lifecycle 会与 M2 形成循环依赖。失败分支、持久化与 logout 要求只改变执行阶段，没有删除，仍是生产发布阻断项。

## 6. 模型目录、能力与费用差异

### 6.1 来源与 schema

- 中国站缓存：`~/.workbuddy/cache/acc-product-config-v3.json`；官方运行日志记录来源为 `https://copilot.tencent.com/v3/config`。
- 国际站缓存：`~/.workbuddy-ai/cache/acc-product-config-v3.json`，SHA-256 `f8805736077d73549ef88f6615b7e246a6548b311f1b526c0c673ea020e89027`。
- 中国站缓存有 50 个模型；50 个均有非空 ID，41 个有正数 input/output budget，39 个声明图像、31 个声明 reasoning、39 个声明 tool call，32 个有非空 `credits`。
- **Catalog eligibility 与 release validation 分离。** 目标 realm 缓存中具备合法 ID、Chat 类型、有效 input/output budget 和必要 schema 的条目可进入目录候选；9 个缺少有效预算或属于 completion/image 专用类型的条目不可注册为 Chat 模型。能力字段为 null 时按未知处理，不补默认 true。目录合格不等于 release-validated。

### 6.2 当前缓存的 realm 差异

| 指标 | 中国站 | 国际站 |
|---|---:|---:|
| 模型总数 | 50 | 22 |
| 独占 model ID | 39 | 11 |
| 两站重合 model ID | 11 | 11 |
| 非空 `credits` | 32 | 21 |

中国站独占示例：`hy3-x`、`deepseek-v4-pro`、`deepseek-v4-flash`、`glm-5.3-flash`、`minimax-m3`。国际站独占示例：`default-model`、`gpt-5.5`、`gpt-5.4`、`gpt-6-astra`、`gemini-3.5-flash`。

### 6.3 同 ID 也不能共享能力或费用

以下均来自两站当前运行缓存。`credits` 是原始展示元数据；币种、结算单位和实际扣费公式未验证，因此只能比较字符串，不能宣称实际价格。

| model ID | 中国站 | 国际站 | 结论 |
|---|---|---|---|
| `fast-model` | `x0.21`；300k input / 48k output | `x0.34 credits`；200k / 32k | 费用展示与预算均不同。 |
| `balanced-model` | `x0.65`；300k / 48k | `x0.59 credits`；256k / 32k | 中国站展示倍率更高，但单位语义未知；预算不同。 |
| `deep-model` | `x1.20`；300k / 48k；reasoning=true | `x3.33 credits`；176k / 24k；reasoning 未声明 | 价格、预算和能力证据均不同。 |
| `deepseek-v4.1-flash` | `x0.03`；1M / 128k | `x0.00`；1M / 128k | 同 ID 的免费结论相反，绝不能跨站复用。 |
| `glm-5.3` | `x0.79`；1M / 64k | `x0.79`；1M / 48k | 展示倍率相同也不代表预算相同。 |

Release validation 只选择代表模型覆盖真实 Chat/reasoning/tools/vision，不要求逐一 live 测试所有目录合格模型。当前代表候选为 `fast-model`、`balanced-model`、`deep-model`：三者均有完整基础 metadata，`fast-model` 已通过真实 streaming Chat，另外两个仍只有目录证据。任何模型未经对应能力 gate 前，不得声明其 reasoning/tools/vision 已生产验证。

### 6.4 费用处理决定

- 不把 `credits` 解析为货币价格；保留原始文本和来源版本。
- 不把空字符串/null 当作免费。
- 只有目标 realm 的独立证据明确为零成本时才允许进入该 realm 的 free scope。
- 同一 model ID 在两个 Provider 下分别保存能力、预算和费用证据；不得用全局 model-ID map。

## 7. Billing 与 builtin 决定

**UsageProvider：不注册。** 中国站 Billing endpoint、headers、请求体、响应 envelope、credits/plan 语义均未完成真实验证。由于生产代码中没有 `workbuddy-cn` 注册路径，也没有中国站 UsageProvider，当前中国站 Billing 请求数为零。

**builtin catalog：不启用。** 官方安装包虽带版本绑定的基础模型列表，但运行时还会从 `/v3/config` 合并/替换，且本次没有完成 OMP schema、过期策略和真实 Chat 联动验收。缓存缺失、不可读或无效时应返回 unavailable/empty，不读取国际站缓存或 builtin。

## 8. 准入检查

| Gate | 结果 |
|---|---|
| 国际站 typecheck 与永久测试 | PASS |
| 当前 HEAD 国际站真实 smoke | PASS：隔离登录、restart/headless、`hy3` 精确响应、logout |
| 中国站 endpoint/auth 核心 live 证据 | PASS：start/pending/success/account/refresh |
| 后续中国站 OMP OAuth 全分支 | DEFERRED TO 3.2/4.2：拒绝/超时/429/取消/restart/logout 仍是发布 gate |
| 中国站真实 Chat streaming | PASS：`fast-model`、reasoning、usage、`[DONE]`、精确 final text |
| 中国站 tools/vision/三模型矩阵 | DEFERRED：后续 release gate |
| 中国站目录与 realm 差异 | PASS（目录证据） |
| 中国站价格/credits 实际计费语义 | BLOCKED：只确认目录倍率与 Chat usage credit 字段类型 |
| 中国站 Billing | BLOCKED，因此明确禁用 |
| 中国站 builtin | BLOCKED，因此明确禁用 |
| 仓库无猜测 CN 运行时值 | PASS：`src/`、`extensions/`、`package.json` 未出现 `workbuddy-cn`、`workbuddy.cn`、`copilot.tencent.com` 或 `WORKBUDDY_CN` |

最终决定：M0 六项全部完成，可进入 M1 的国际站无行为迁移。M2 只能把本文“已观察”值作为非生产候选，并保持 Billing/Usage 与 builtin 禁用；Chat URL/header 需在 3.6 前由脱敏 OMP 出站记录复核，domain restart recovery 与 account finalize 需在 3.2 闭环。3.2/4.2 的中国站客户端与发布 gate 全部通过前，不得宣布或发布生产 `workbuddy-cn`。
