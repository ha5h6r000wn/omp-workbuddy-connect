# Spec Delta

## MODIFIED Requirements

### Requirement: AUTH-01 Single credential authority
每个 WorkBuddy Provider 的运行时 Chat、身份 Header 与可选积分认证 SHALL 仅来自该 Provider 的 OMP AuthStorage namespace 及其认证生命周期。系统 MUST NOT 从 `.workbuddy-auth.json`、Desktop credential、环境变量凭据文件、另一个 WorkBuddy realm 或其他 Provider 选择或回退 Token，也不得在插件中另行持久化正式凭据或建立独立刷新器。

#### Scenario: Legacy credentials remain on disk
- **WHEN** 目标 WorkBuddy Provider 在 OMP 中未登录，但旧插件、Desktop 或另一个 realm 的凭据存在
- **THEN** 目标 Provider 被视为未登录并提示 `/login <providerId>`，不会读取其他来源恢复认证或发送 Chat

#### Scenario: Restart uses persisted host credential
- **WHEN** 某一 realm 成功登录后重启 OMP，且该 Provider 的宿主凭据仍有效
- **THEN** 该 realm 的 Chat 与可选积分使用恢复的同一宿主账号，无需重新登录或读取其他 realm/旧文件

### Requirement: AUTH-02 Validated login and identity semantics
每个 WorkBuddy realm 的 OAuth 登录 SHALL 在返回宿主持久化前校验非空 access、refresh、有效 expiry 和 durable uid，并映射到 access、refresh、expires、accountId。国际站保持既有 Plugin Auth/JWT 证据路径；中国站 poll token success 后 MUST 调用已验证的 `/v2/plugin/account`，以 `data.uid` finalize durable accountId。中国站 JWT `uid`/`sub` 只有在独立脱敏验证其与 account uid 一致后 MAY 作为 restart reconstruction 候选；email、nickname、name、enterprise 字段均不得替代 accountId。

#### Scenario: Complete login response
- **WHEN** 目标 realm 的 Plugin Auth 与其 identity finalize 返回有效 credential、durable subject 和明确真实 email，可选地返回 enterpriseId
- **THEN** OMP 获得映射正确的 OAuth credential，email 保持原语义；enterpriseId 存在时映射 orgId，不存在时省略 orgId

#### Scenario: Missing or invalid login fields
- **WHEN** 目标 realm 完成其 identity finalize 后仍无法提供 durable uid/sub，或 access/refresh/expiry 无效
- **THEN** 登录失败，不返回可持久化的部分成功 credential，并提示重新登录；email/name 与另一个 realm identity 不得作为 fallback

#### Scenario: Nickname without email
- **WHEN** 官方响应只有 nickname 而没有真实 email
- **THEN** nickname 不写入 OAuth email，重启后允许用账号标识展示，不为保留昵称新增凭据文件

#### Scenario: CN token succeeds before account finalize
- **WHEN** 中国站 poll 返回有效 token bundle，但尚未完成 account 请求，或 account response 缺少有效 `data.uid`
- **THEN** 登录不得向 OMP 返回可持久化 credential，Chat 请求数为零，且不从另一个 realm、昵称、email 或未验证 JWT claim 补 identity

#### Scenario: CN account finalize succeeds
- **WHEN** 中国站 token bundle 有效且同一授权流程的 `/v2/plugin/account` 返回 durable uid
- **THEN** 该 uid 映射为 accountId，token bundle 的 access/refresh/expiry 与它一起交给目标 Provider 的 AuthStorage；另一个 realm 的 credential 不变

#### Scenario: JWT identity is evaluated as reconstruction evidence
- **WHEN** 实现评估 access token 的 `uid`/`sub` 是否可用于 restart reconstruction
- **THEN** probe 只记录 claim key、issuer hostname 与 account uid 的相等性，不记录 claim value；未经一致性证据不得启用该 fallback

### Requirement: AUTH-04 Durable credential identity binding
在当前宿主支持契约内，每个 WorkBuddy Chat transport attempt 的 Authorization、X-User-Id SHALL 来自目标 Provider 的同一个唯一 stored OAuth durable credential row。credential 有 orgId 时 SHALL 同源发送 X-Enterprise-Id；无 orgId 时 SHALL 发送目标 realm 已验证的 no-enterprise marker。Authorization 仅由宿主 AuthStorage resolver 解析；`getApiKey(credentials)` 在返回 access 前验证宿主选择的 accountId/可选 orgId。固定 Header 与 domain policy 均来自目标 realm descriptor：fixed 值不得跨 realm 复用，credential-derived 值必须从同一 durable row 的已验证持久状态或确定性 reconstruction 获得。

当宿主向 Header resolver 暴露 request-attempt identity 或原子 Bearer-plus-Headers API 时，Bearer 与 identity Headers MUST 使用该原子来源。当前已验证的 pinned OMP 18.2.6 contract 中，`Model.resolveHeaders(signal)` 不暴露 request session/attempt；扩展 SHALL 对唯一 stored row 在 resolver 内捕获并复核 credentialId/accountId/orgId/domain，检测到变化时在 HTTP 前失败，但 MUST NOT 把这项检查宣称为独立 Bearer/Header lookup 的原子同源证明。当前产品支持边界是串行换号：活动请求先完成或取消，再执行 logout/login；并发 credential replacement 不受支持，且不得用全局 lifecycle session、pending queue、锁或另一个 realm 推断本次请求身份。其他宿主版本必须单独核对 API contract，不能由 smoke 结果推定。

#### Scenario: First authenticated request
- **WHEN** 用户在任一 WorkBuddy realm 首次登录后发出模型请求
- **THEN** 实际出站请求使用目标 Provider 唯一 durable row 的账号 identity 与 realm policy；在支持边界内的序列化请求中，捕获/复核不一致会在 Chat HTTP 前 fail closed

#### Scenario: Refresh, retry, and account switch
- **WHEN** 单账号发生 forced refresh 或 401 retry，或活动请求结束/取消后 A logout、B login
- **THEN** refresh/retry 保留同一 durable identity；B 登录后的新 attempt 不使用 A identity，迟到 A 结果不恢复旧身份

#### Scenario: Account changes between Bearer and Header resolution
- **WHEN** resolver 捕获目标 Provider 的唯一 row 后、返回 Headers 前检测到 credentialId/accountId/orgId/domain 改变
- **THEN** 请求在任何 Chat HTTP 前失败，不发送混合身份，也不回退另一个 realm

#### Scenario: Host cannot expose the Bearer-selected request identity
- **WHEN** 当前 OMP 在 Bearer selection 与 `resolveHeaders` 之间发生扩展无法观察的并发 credential replacement
- **THEN** release evidence 明确标记该场景不可证明且在支持边界外，要求先完成或取消活动请求再换号；不得把 serial probe、last lifecycle session 或 sole-row 假设报告为完整原子性通过

#### Scenario: Request session differs from lifecycle binding
- **WHEN** 同一 Provider 服务 main、Task 或 child 等多个 session，实际请求由 session B 的 AuthStorage resolver 选择 Bearer，而最后一次 lifecycle binding 属于 session A
- **THEN** Header resolver 不得读取全局 last-bound session A 或另一个 Provider 的 active row；它只执行目标 Provider 的唯一 stored-row 捕获/复核，并明确保留宿主无法关联本次 Bearer identity 的支持边界

#### Scenario: Persisted credential before session binding
- **WHEN** OMP 重启时目标 Provider 的 AuthStorage 已持久化一个完整 credential，Provider 在 `session_start` 绑定前注册并投影模型
- **THEN** 该 Provider 模型保留 request-boundary resolver；任一 lifecycle session 绑定其 AuthStorage authority 后首个请求动态读取当前唯一 stored identity，注册期未绑定不得被误判为非法 credential

### Requirement: AUTH-05 Three-layer fail closed
每个 WorkBuddy Provider SHALL 在登录返回前、刷新返回前、提供请求 API key 前分别校验必要身份。只在模型投影抛异常不构成拒绝保证；accountId 缺失时 MUST 不提供可用认证且不发送 Chat Completion 请求。enterpriseId/orgId 是服务端实证可缺省的可选组织属性，不属于账号主体；缺省时必须发送目标 realm 已验证的 no-enterprise marker。

#### Scenario: Stored credential lacks accountId
- **WHEN** 目标 Provider 的宿主 credential 有 access 但没有 accountId
- **THEN** 在请求认证边界拒绝调用，提示 `/login <providerId>`，观测到该 Provider 零个 Chat HTTP 请求

#### Scenario: Stored credential omits optional orgId
- **WHEN** 目标 Provider 的唯一宿主 credential 有完整 accountId 但没有 orgId
- **THEN** 请求继续绑定该 durable row，发送 X-User-Id 与目标 realm 已验证的 no-enterprise marker，且不发送 X-Enterprise-Id

### Requirement: AUTH-06 Provider isolation during identity binding
账号身份绑定 SHALL 只影响发起请求的目标 Provider。`workbuddy` 与 `workbuddy-cn` SHALL 分别使用自身的 AuthStorage namespace、身份 resolver 和固定 realm headers，并保留所有其他 Provider 的模型内容和行为。任一 Provider 身份无效或 stored credential 歧义时 SHOULD 只从该 Provider 的投影目录移除 rows，同时其请求认证边界仍须独立 fail closed；不得依赖 modifier 抛错或另一个 realm 的有效凭据。

#### Scenario: Mixed-provider catalog
- **WHEN** 目录同时包含 OpenAI、Anthropic、`workbuddy` 与 `workbuddy-cn` 模型
- **THEN** 每个 WorkBuddy realm 只获得自身 request-boundary identity resolver，其他 Provider 的模型内容保持不变

#### Scenario: One realm has invalid credentials
- **WHEN** 中国站 credential 缺失或歧义而国际站 credential 有效，或反之
- **THEN** 仅无效 realm 的模型调用被拒绝，有效 realm 不被登出、隐藏或改写身份

### Requirement: AUTH-07 Enforced single effective account
每个 WorkBuddy Provider SHALL 各自只支持一个 stored OAuth credential。`listOAuthAccounts(providerId)` 对目标 Provider 返回零行时视为该 realm 未登录，一行时允许继续，超过一行时该 realm 的模型调用 SHALL 被明确拒绝且不得擅自选择、轮换或删除用户凭据。`active` 仅表示指定 session sticky 到目标 Provider 的哪一行，不得用于判断 stored credential 数量。一个 realm 的 credential MUST NOT 计入、满足或修复另一个 realm 的账号约束。

#### Scenario: Multiple stored credentials are detectable
- **WHEN** 公开 API 显示某一 WorkBuddy Provider 存在多个 stored OAuth credentials
- **THEN** 明确拒绝该 Provider 的模型调用并告知单账号要求，另一个 Provider 的合法单账号调用不受影响

#### Scenario: Sequential account switch in existing session
- **WHEN** realm 内 A 登录并调用、刷新并调用，然后 A 退出、B 登录，并在已有会话和新 subagent 中请求
- **THEN** B 登录后的请求不再带 A Bearer 或身份 Header，且不会读取另一个 realm 的 credential

### Requirement: AUTH-08 Provider-scoped logout
`/workbuddy logout` 与 `/workbuddy-cn logout` SHALL 只删除各自 Provider 在 OMP 中的认证，使该 realm 的旧认证和身份运行态不可再用于新请求，清理该 realm 的 UI/Usage 异步状态并按需更新其模型。logout MUST NOT 删除另一个 realm 的宿主 credential、设置、UI 或模型，也不得删除 Desktop credential 或客户端数据。

#### Scenario: Logout with pending billing request
- **WHEN** 用户退出一个 realm 时该 realm 的积分或目录请求仍在进行
- **THEN** 仅该 realm 的宿主 credential 被删除，后续 Chat 不可认证，迟到响应不恢复其状态，另一个 realm 与 Desktop 登录保持不变

## ADDED Requirements

### Requirement: AUTH-10 Realm-bound authentication protocol
每次登录、轮询、刷新和 Chat attempt SHALL 使用目标 Provider 已验证的 API origin/path、start request shape 与 nonce policy、poll interval/deadline、Origin/Referer、product/domain policy、Plugin Auth headers、refresh source 与 pending/status 语义；token success 后 SHALL 执行该 realm 的 identity finalize。凭据、pending code、AbortSignal 和异步结果 MUST NOT 在 `workbuddy` 与 `workbuddy-cn` 之间复用或回退。

#### Scenario: Concurrent login in both realms
- **WHEN** 国际站和中国站登录流程同时处于 polling 或 refresh
- **THEN** 每个流程只访问自身 endpoint、使用自身 protocol headers 和取消边界，并将结果写入自身 AuthStorage namespace

#### Scenario: Realms use different start and polling contracts
- **WHEN** 国际站与中国站分别发起登录
- **THEN** 国际站保留既有 query/body nonce、platform 与 2 秒/15 分钟行为，中国站使用已观察的 body `{}`、platform `workbuddy` 与 1 秒/5 分钟行为；任一 realm 不借用另一方的 request shape 或 deadline

#### Scenario: Realm protocol is unavailable
- **WHEN** 中国站协议字段尚未通过证据准入或响应不满足其已验证 schema
- **THEN** 中国站认证失败并保持未登录，不尝试国际站 endpoint、header、response parser 或 credential fallback

### Requirement: AUTH-11 Credential-derived domain persistence
需要 credential-derived `X-Domain` 的 realm SHALL 在 login/refresh response 中验证非空 domain，并确保它能随同一 OMP OAuth durable row 在 restart 后恢复。实现 MAY 使用语义匹配且经宿主 round-trip 验证的标准 credential 字段，或使用经脱敏证据证明的确定性 token claim reconstruction；MUST NOT 创建插件 sidecar credential、读取 Desktop credential、借用另一个 realm domain，或挪用语义无关的宿主字段。恢复机制未通过真实 restart Chat 前，目标 Provider 不得进入生产装配。

#### Scenario: JWT issuer is evaluated as a domain reconstruction candidate
- **WHEN** 中国站评估从 access token 恢复 domain
- **THEN** 脱敏 probe 只记录 claim keys 和 `hostname(jwt.iss) === token-domain` 的布尔结果，不记录 claim/domain 值；只有等式经真实 token 证明且 issuer URL 校验安全后才可启用 reconstruction，否则保持未支持

#### Scenario: Restart restores credential-derived domain
- **WHEN** 中国站登录成功、OMP restart 后使用持久化 credential 发起 Chat
- **THEN** `X-Domain` 与该 durable row 的登录/refresh domain 一致，accountId 仍来自已 finalize identity，不重新读取 Desktop 或插件 sidecar 文件

#### Scenario: Domain is missing or cannot be reconstructed
- **WHEN** login/refresh 缺少有效 domain，或 restart 后不能从宿主持久状态/已验证 token claim 恢复
- **THEN** 中国站 fail closed 并发送零个 Chat HTTP 请求，提示重新登录或保持 Provider 未生产注册；不得回退固定 CN/Intl domain
