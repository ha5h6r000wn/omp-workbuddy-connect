# WorkBuddy Auth Identity Specification

## Purpose

定义 WorkBuddy OAuth 凭据的唯一权威来源、生命周期和账号身份一致性，使登录、刷新、重启、退出及换号期间的每个真实模型请求均具有完整且同源的认证信息，缺失或歧义时安全拒绝发送。

## Requirements

### Requirement: AUTH-01 Single credential authority
运行时 Chat、身份 Header 与积分认证 SHALL 仅来自 OMP AuthStorage 及其认证生命周期。系统 MUST NOT 从 `.workbuddy-auth.json`、Desktop credential、环境变量凭据文件选择或回退 Token，也不得在插件中另行持久化正式凭据或建立独立刷新器。

#### Scenario: Legacy credentials remain on disk
- **WHEN** OMP 中未登录但旧插件或 Desktop 凭据存在，或设置了 `WORKBUDDY_AUTH_FILE`
- **THEN** WorkBuddy 被视为未登录并提示 `/login workbuddy`，不会读取旧来源恢复认证或发送 Chat

#### Scenario: Restart uses persisted host credential
- **WHEN** 成功登录后重启 OMP，且宿主凭据仍有效
- **THEN** Chat 与积分使用恢复的同一宿主账号，无需重新登录或读取旧文件

### Requirement: AUTH-02 Validated login and identity semantics
OAuth 登录 SHALL 在返回宿主持久化前校验非空 access、refresh、有效 expiry 和 durable uid，并映射到 access、refresh、expires、accountId。账号 uid 优先取 Plugin Auth data.uid；服务端省略该字段时 MAY 取同一官方 access token 的 JWT `uid`/`sub` subject claim。JWT email、nickname 或 name MUST NOT 代替账号 ID。enterpriseId 仅在官方响应明确提供时映射为 orgId；缺省时不得伪造企业身份。真实 email 才能写入 email 字段；nickname SHALL 仅用于展示。国际版 domain 不作为可变 credential 路由保存。

#### Scenario: Complete login response
- **WHEN** 官方 Plugin Auth 返回有效凭据、durable subject 和明确真实 email，可选地返回 enterpriseId
- **THEN** OMP 获得映射正确的 OAuth credential，email 保持原语义；enterpriseId 存在时映射 orgId，不存在时省略 orgId

#### Scenario: Missing or invalid login fields
- **WHEN** 登录响应及同一官方 access token 均无法提供 uid/sub，或 access/refresh/expiry 无效
- **THEN** 登录失败，不返回可持久化的部分成功 credential，并提示重新登录；email/name 不得作为身份 fallback

#### Scenario: Nickname without email
- **WHEN** 官方响应只有 nickname 而没有真实 email
- **THEN** nickname 不写入 OAuth email，重启后允许用账号标识展示，不为保留昵称新增凭据文件

### Requirement: AUTH-03 Host-managed refresh preserves identity
Access Token 过期后系统 SHALL 由 OMP OAuth 刷新生命周期调用官方刷新协议，以传入宿主 credential 为唯一输入，返回有效 access/expiry 并保留 accountId、已有可选 orgId 及已确认的身份字段。成功响应明确返回新 refresh token 时 SHALL 替换旧值；响应省略 refresh token 时 SHALL 保留传入宿主 credential 的 refresh token。该 omission 策略以冻结 upstream `cb2398e3374144db0c088d7a4887dc0913342858` 的既有 fallback 行为为兼容证据。orgId 缺省时刷新 SHALL 省略 X-Enterprise-Id，不得伪造企业 ID，也不得把仅属于 Chat 的 no-enterprise marker 扩展到刷新协议。服务端 refresh response MAY 省略重复身份；响应明确返回与已有 durable identity 矛盾的字段时 MUST 失败。MUST NOT 从旧文件补身份或在身份冲突不明时继续使用 Token。

#### Scenario: Forced access expiry
- **WHEN** 已登录账号的 access 被强制过期且 refresh 有效
- **THEN** 宿主自动刷新并继续请求，新 Bearer 与保留的 accountId、可选 orgId 属于同一账号，响应仍可 Streaming

#### Scenario: Invalid refresh or identity
- **WHEN** refresh 失效、access/expiry 响应无效、宿主缺少 accountId，或响应明确返回了与已有身份矛盾的值
- **THEN** 刷新不返回可用认证，报告明确错误并提示重新登录，不回退其他 Token 来源

#### Scenario: Refresh response omits rotation and repeated identity
- **WHEN** 成功 refresh 返回有效新 access/expiry，但省略新 refresh token、uid 和 enterpriseId
- **THEN** 输出保留传入宿主 credential 的 refresh、accountId 和已有可选 orgId；不是从旧文件或其他账号补值

### Requirement: AUTH-04 Durable credential identity binding
每个 WorkBuddy Chat transport attempt 的 Authorization、X-User-Id SHALL 属于同一个唯一 stored OAuth durable credential row。credential 有 orgId 时 SHALL 同源发送 X-Enterprise-Id；无 orgId 时 SHALL 发送官方 `X-No-Enterprise-Id: 1`，不得伪造组织。Authorization SHALL 仅由宿主原生 AuthStorage resolver 解析。Header 与 Bearer 的解析 MUST 共享宿主提供的 request-attempt identity 或由同一个原子 credential resolution 产生；分别读取“当前唯一账号”不构成同源证明。WorkBuddy `getApiKey(credentials)` SHALL 在返回 access 前验证宿主选择的 accountId/可选 orgId。401 retry 是新的 transport attempt：同账号 refresh 时 durable identity MUST 保持一致；用户明确换号后 MAY 使用新 row，但该 retry 内 Bearer 与 Headers 仍 MUST 原子同源。固定 Headers SHALL 使用国际版 Origin/Referer/X-Domain、SaaS X-Product 及已验证协议值，不使用 credential domain 改写路由。

#### Scenario: First authenticated request
- **WHEN** 用户首次登录后发出模型请求
- **THEN** 实际出站请求的 Bearer、用户 ID 和可选企业语义属于同一 durable credential ID；有 orgId 时发送企业 ID，无 orgId 时发送 no-enterprise marker，并携带官方国际版固定 Headers

#### Scenario: Refresh, retry, and account switch
- **WHEN** 单账号发生 forced refresh 或 401 retry，或 A logout 后 B 在已有会话登录
- **THEN** forced refresh/401 retry 可更换 Bearer，但每次出站的 Bearer 与用户/可选企业身份仍属于同一 durable credential row；切换到 B 后不再使用 A row，迟到 A 结果不会恢复旧身份

#### Scenario: Account changes between Bearer and Header resolution
- **WHEN** 宿主已为请求选择 A Bearer，但在 identity Headers 解析前 storage 切换到 B，或并发 B 请求改变选择
- **THEN** A 请求必须在任何 Chat HTTP 前失败；不得发送 B Headers 与 A Bearer，也不得用全局 pending cache 猜测请求归属

#### Scenario: Request session differs from lifecycle binding
- **WHEN** 同一 Provider 服务 main、Task 或 child 等多个 session，实际请求由 session B 的 AuthStorage resolver 选择 Bearer，而最后一次 lifecycle binding 属于 session A
- **THEN** Header identity MUST 与请求 session B 的 Bearer 同源；不得读取全局 last-bound session A 的 `active` row 冒充当前请求证明

#### Scenario: Persisted credential before session binding
- **WHEN** OMP 重启时 AuthStorage 已持久化一个完整 WorkBuddy credential，Provider 在 `session_start` 绑定前注册并投影模型
- **THEN** WorkBuddy 模型保留 request-boundary resolver；任一 lifecycle session 绑定共享 AuthStorage authority 后首个请求动态读取当前唯一 stored identity，注册期未绑定不得被误判为非法 credential

### Requirement: AUTH-05 Three-layer fail closed
系统 SHALL 在登录返回前、刷新返回前、提供请求 API key 前分别校验必要身份。只在模型投影抛异常不构成拒绝保证；accountId 缺失时 MUST 不提供可用认证且不发送 Chat Completion 请求。enterpriseId/orgId 是服务端实证可缺省的可选组织属性，不属于账号主体；缺省时必须显式发送 no-enterprise marker。

#### Scenario: Stored credential lacks accountId
- **WHEN** 宿主已存 credential 有 access 但没有 accountId
- **THEN** 在请求认证边界拒绝调用，提示 `/login workbuddy`，观测到零个 Chat HTTP 请求

#### Scenario: Stored credential omits optional orgId
- **WHEN** 唯一宿主 credential 有完整 accountId 但没有 orgId
- **THEN** 请求继续绑定该 durable row，发送 X-User-Id 与 `X-No-Enterprise-Id: 1`，且不发送 X-Enterprise-Id

### Requirement: AUTH-06 Provider isolation during identity binding
账号身份绑定 SHALL 仅影响 `workbuddy` 的模型，保留所有其他 Provider 的模型内容和行为，不得假定 modifier 输入只有 WorkBuddy。身份无效或 stored credential 歧义时 SHOULD 从投影目录移除 WorkBuddy rows，同时请求认证边界仍须独立 fail closed；不得依赖 modifier 抛错。

#### Scenario: Mixed-provider catalog
- **WHEN** 带 OpenAI、Anthropic、WorkBuddy 模型的目录应用 WorkBuddy 身份绑定
- **THEN** 仅 WorkBuddy 模型获得相应 request-boundary identity resolver；其他 Provider 的模型内容保持不变

### Requirement: AUTH-07 Enforced single effective account
v1 SHALL 只支持一个 stored WorkBuddy OAuth credential。`listOAuthAccounts('workbuddy')` 返回零行时视为未登录，一行时允许继续，超过一行时模型调用 SHALL 被明确拒绝且不得擅自选择、轮换或删除用户凭据。`active` 仅表示指定 session sticky 到哪一行，不得用于判断 stored credential 数量。不能证明身份一致性不得发布。

#### Scenario: Multiple stored credentials are detectable
- **WHEN** 公开 API 显示存在多个 stored WorkBuddy OAuth credentials
- **THEN** 明确拒绝模型调用并告知单账号要求，不允许宿主轮换导致身份错配

#### Scenario: Sequential account switch in existing session
- **WHEN** A 登录并调用、刷新并调用，然后 A 退出、B 登录，并在已有会话和新 subagent 中请求
- **THEN** B 登录完成后的请求不再带 A Bearer、A user ID 或 A enterprise ID，且每次请求的所有认证信息属于 B 的同一 durable credential row

### Requirement: AUTH-08 Provider-scoped logout
`/workbuddy logout` SHALL 删除 OMP 中 WorkBuddy 的认证、使旧认证和身份运行态不可再用于新请求、清理 Widget/status 并使待返回积分失效，必要时更新模型。不得删除 Desktop credential 或 WorkBuddy 客户端数据。

#### Scenario: Logout with pending billing request
- **WHEN** 用户退出时旧账号积分请求仍在进行
- **THEN** 宿主 WorkBuddy credential 被删除，后续 Chat 不可认证，迟到响应不恢复登录状态或 Widget，Desktop 登录保持不变

### Requirement: AUTH-09 Cancellable OAuth polling and actionable errors
OAuth polling SHALL 响应用户取消、session abort、extension shutdown，停止后续轮询并终止可取消的在途请求；错误 SHALL 区分授权拒绝、轮询超时、用户取消、网络失败、服务端 5xx 和限流。仅 authorization polling 收到 429 且携带有效 Retry-After 时 SHALL 在总轮询截止时间与取消边界内等待后继续 poll。一次性的 login-start 与 refresh 请求收到 429 时 SHALL 返回 `rate_limited`，MUST NOT 在插件中建立独立重试循环。

#### Scenario: Cancellation during request or poll delay
- **WHEN** 用户取消、会话中止或扩展关闭发生在 HTTP 请求或下一次轮询等待期间
- **THEN** 轮询停止，不持久化迟到授权结果，不留下继续发请求的定时任务

#### Scenario: Authorization rejection and timeout
- **WHEN** 官方明确拒绝授权或达到轮询总截止时间
- **THEN** 返回对应错误，不把拒绝当作继续等待，也不无限轮询

#### Scenario: Rate limit or network failure
- **WHEN** authorization polling 返回 429 和有效 Retry-After，或任一 OAuth 请求遇到网络失败或 5xx
- **THEN** polling 限流等待遵守 Retry-After 且可取消，网络失败和 5xx 分别可识别，错误不包含认证秘密

#### Scenario: One-shot endpoint rate limit
- **WHEN** login-start 或 refresh 返回 429
- **THEN** 返回 `rate_limited` 且插件只发起一次请求，不建立独立 retry loop
