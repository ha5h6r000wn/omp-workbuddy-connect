# Design

## Context

动机见 `proposal.md`。裁决来源为 `docs/260919 - OMP WorkBuddy Connect 国际版开发计划 V2.md`；原需求文档补充 V2 未改变的国际版端点、配置目录和命令定义。前一轮计划不是优先于 V2 的约束。

### Historical Planning Snapshot

以下观测描述 OpenSpec change 最初提出时的仓库状态，作为设计背景保留，不代表当前实现。正式冻结基线、已应用证据和完成状态分别以 `docs/omp-port/baseline-manifest.md`、`docs/omp-port/api-compatibility-matrix.md` 和 `tasks.md` 为准。

| 对象 | 仓库/标识 | 精确版本或提交 | 证据与边界 |
|---|---|---|---|
| Fork | `https://github.com/ha5h6r000wn/omp-workbuddy-connect`，分支 `feat/omp-port` | `cb2398e3374144db0c088d7a4887dc0913342858` | `git log -1`；仅代表 HEAD，不代表全部工作区 |
| Upstream | `https://github.com/icekale/pi-workbuddy-connect` | `cb2398e3374144db0c088d7a4887dc0913342858` | 本地 Fork HEAD 与本次查询 upstream/main 相同；M0 冻结保留该精确 SHA，不随 main 漂移 |
| OMP | `can1357/oh-my-pi`，`v18.2.6` | `78b753124d11f8dd3ae73e2524125890ff7c977e` | `git ls-remote` 和 GitHub commits/v18.2.6 的 commit SHA 一致 |
| 包版本 | `omp-workbuddy-connect` | 当前 manifest `1.1.7` | V2 的 v1 是功能基线，不自动降级包版本 |
| 未提交修改 | `.gitignore`、`extensions/workbuddy.ts`、`package.json` | 本次观察相对 HEAD 共 22 additions / 11 deletions | 只记录已跟踪差异，不声称覆盖未跟踪文件；M0 保存完整工作区证据，不能覆盖用户工作 |

规划快照中的实现仍集中在 `extensions/workbuddy.ts`：`saveOwn/current/resolveCred` 维护旧凭据；refresh 从旧文件补身份并丢失身份输出；Provider 使用 Marker、unsupported hook/refreshModels；scope 空集合回退 `FREE_IDS`；模型默认扩展到全部 effort；payload 自动插入 system。当时 `package.json` 已有 OMP manifest/import，但 peer 为 `*`；`tsconfig.json` 只列扩展入口。两个既有测试保护 payload 隔离和启动不阻塞，后者使用旧凭据文件。

规划轮次曾执行 `node --experimental-strip-types test/scope.test.mts` 并记录 `ERR_INVALID_TYPESCRIPT_SYNTAX`；当时源码仍显示 login 函数缺少闭合。该历史失败不代表当前 apply 状态，修复及复验结果见上述证据文件。

宿主参考：[18.2.6 Extension types](https://github.com/can1357/oh-my-pi/blob/78b753124d11f8dd3ae73e2524125890ff7c977e/packages/coding-agent/src/extensibility/extensions/types.ts)、[ModelRegistry](https://github.com/can1357/oh-my-pi/blob/78b753124d11f8dd3ae73e2524125890ff7c977e/packages/coding-agent/src/config/model-registry.ts)。已读源码表明 modifier 接收完整目录，异常被捕获并可能继续提供未投影目录；这些事实不能替代宿主运行验证。

## Goals / Non-Goals

**Goals:**
- 让宿主 credential 成为唯一 authority，身份原子性与 fail-closed 作为执行边界而非 UI 提示。
- 按六份 capability specs 形成可追溯的请求、模型、UI 与发布契约；M0 的具体宿主实验先于 M1 生产认证实现。
- 用最小职责模块隔离协议、模型、状态与显示，兼容变化可以独立验证。
- 正式验收以真实 OMP + WorkBuddy 为最终证据，文档生成完成不等于功能完成。

**Non-Goals:**
- 不改 OMP、AuthStorage 格式或 ModelRegistry，不引入 Pi shim、自定义 Chat client/transport、SSE/tool parser、全局 fetch interceptor。
- 不建 CredentialStore、TransportManager、Provider Framework、Generic Gateway Adapter 或 Custom HTTP Retry Framework。
- 不自动迁移桌面凭据，不支持国内版、真正多账号轮换或更早 OMP；不承诺精确即时 model_select UI。
- 不在规划阶段替 M0 编造在线目录/Usage 可用性或真实账号验收证据。

## Decisions

### D1 — 精确基线和宿主实验是 M0 gate

选择：开发依赖/锁文件针对 18.2.6；修复 syntax、imports、manifest 和类型不接受的字段/事件，使用官方宿主隔离配置做最小契约探针。M0 的真实 `/login workbuddy`、持久化/refresh/delete/restart 实验用于证明公开 API，不声称已经完成 M1 的生产级认证实现。不得使用手写 AuthStorage 文件、私有方法或 `any` 掩盖类型问题。

API Compatibility Matrix 至少包括：

| API/行为 | 处理 | 所需证据 |
|---|---|---|
| `omp.extensions`、`@oh-my-pi/*` | 保留已有迁移，锁定真实类型和导出路径 | 编译、官方加载 |
| Provider 顶层 `name` | 不使用；OAuth `name` 是不同字段，保留合法用途 | ProviderConfig 类型 |
| `refreshModels`、`before_provider_headers`、`model_select`、Marker | 删除旧契约 | 编译和事件加载 |
| `before_provider_request` | 保留；验证返回 payload 语义及 subagent 加载 | 真实请求和隔离测试 |
| `getApiKey`、`refreshToken` | Bearer 与 refresh 的宿主入口 | 缺身份零请求、刷新持久化 |
| `Model.resolveHeaders`、`AuthStorage.listOAuthAccounts` | per-attempt Header 路径，但无 request session | sole-row 前后复核、真实多 session 行为；AUTH-04 原子绑定阻塞 |
| `ExtensionAPI.setModel` | 只能影响后续 Model | 不能补足在途 request identity |
| `modifyModels` | WorkBuddy-only catalog 投影及 resolver 安装点 | 完整目录、重建、异常 fallback、旧 model reference、resolver preservation |
| AuthStorage public access/delete | Bearer 仅走宿主 resolver；Header 使用 `listOAuthAccounts`；logout 使用 provider-scoped 删除 | stored credential 歧义、删除后不可用、重启、无重复 OAuth resolution |
| `fetchDynamicModels` | 走 D6 ADR | 官方在线端点及缓存/范围证据 |
| `usage` / UsageProvider | 走 D8 ADR | account/credits/plan/identity 表达及生命周期 |
| callback AbortSignal、shutdown、headless/role | 使用 18.2.6 实际公开能力 | 轮询取消和运行态加载 |

M0 交付拟存于 `docs/omp-port/`：`baseline-manifest.md`、`api-compatibility-matrix.md`、`credential-behavior.md`、`adr-dynamic-models.md`、`adr-credits-usage.md`、`requirement-implementation-test-matrix.md`。这里只规划这些后续证据文件，不填造实验结果。类型零错误、加载正常、以上 gate 有证据才进入 M1。替代方案“先照着 Pi API 实现再修”会把未知契约扩散到全部功能，拒绝。

### D2 — 一个 authority，三处认证边界

`auth.ts` 负责协议值映射与验证；`workbuddy-api.ts` 只负责国际版 Auth/Refresh/Billing 和 ADR 选中的产品协议。Token 不存插件文件，不在模块全局保持独立 refresh 生命周期。

映射为 access/refresh/expires/accountId，并在官方响应明确提供 enterpriseId 时映射可选 orgId；真实 email 才写 email。nickname 只保存在当前 UI generation 的非认证展示态，重启丢失昵称时展示账号，不为此扩展 credential 存储。domain 固定国际版，不根据服务端任意 domain 路由；不以 JWT email/name 代替 uid。2026-09-20 隔离 Live 登录的脱敏形状为 response keys `accessToken,domain,expiresIn,refreshExpiresIn,refreshToken,scope,sessionState,tokenType`、JWT identity keys 包含 `sub` 但无 enterprise claim。因此保留 `data.uid → JWT uid → JWT sub` 的账号 subject 顺序，禁止 email/name fallback；缺失 enterpriseId 不得伪造 orgId。

登录拒绝缺失或无效 access/refresh/expiry/durable uid；durable uid 可来自 data.uid 或同一官方 access token 的 JWT uid/sub。enterpriseId 是可选组织属性：冻结 upstream `cb2398e3374144db0c088d7a4887dc0913342858` 的 `Cred.enterpriseId?`、`chatHeaders` 无企业时发送 `X-No-Enterprise-Id: 1`、`refreshAccess` 无企业时省略 X-Enterprise-Id，与本次 Live 字段形状一致。刷新以传入宿主 credential 为唯一输入，保留既有账号身份、可选 orgId 和明确 email；新的 access/expiry 必须合法。响应明确提供新 refresh 时替换，省略时仅保留本次宿主输入 credential 的 refresh；不得读取旧文件，也不得保留旧 access 或旧 expiry 伪造成功。服务端可省略重复身份，输出继续保留宿主 durable identity；响应若明确返回与已有身份矛盾的值则失败。

`getApiKey()` 在返回 access 前重验必要 accountId，并确认宿主选择的 credential identity 等于调用时唯一 stored account。request identity resolver 在既有 resolver 前后捕获并复核 credentialId/accountId/orgId，再生成 Header；Header 路径不得再次调用 `getOAuthAccess()`。但 resolver 不接收实际 request session，不能使用最后一次 lifecycle context 的 `active` row 冒充当前请求证明。modifier 内校验用于隐藏非法/歧义 rows，但不是唯一阻断点。

### D3 — Durable credential identity 与单账号安全边界

安全边界是宿主 durable credential row、credentialId 和 accountId；orgId 是同一 row 上的可选组织属性，不是账号主体。单账号 refresh 或 401 retry 可更换 Bearer，但必须保留同一 durable row 的 accountId 和已有 orgId；账号替换必须使后续 request-boundary Bearer 与身份解析共同切换到新 row。该术语与仅用于异步 UI 的 `stateGeneration` 无关。

`modifyModels(models, credentials)` 只处理 `model.provider === 'workbuddy'`，保留其他行，并为 WorkBuddy 组合既有 `resolveHeaders`。OMP 18.2.6 production `streamSimple()` 每个 attempt 先选择 Bearer，401 retry 也重跑 resolver；但 `resolveHeaders(signal)` 无 session/request ID。实现仅保留可证明的 sole-row credentialId/accountId/orgId 前后复核，并使同一 AuthStorage 的多 session bind 幂等。不得用长期静态 Header、重复 `getOAuthAccess()`、last lifecycle session active 或全局 pending cache 伪装修复。
ExtensionAPI 注册入口本身不暴露 ModelRegistry；只有 ExtensionContext 提供公开 `modelRegistry`。`session_start` / `session_switch` 只提供 lifecycle context，不能代表随后每个 request 的 session。runtime binding 仅保留共享 AuthStorage；同一 store 的重复 bind 幂等，不得 clobber 在途请求。未绑定、AuthStorage 替换、scope revision 变化、logout、shutdown 或 abort 仍在 transport 前 fail closed；注册期未绑定不得永久删除合法持久化模型。

`listOAuthAccounts('workbuddy')` 返回的 stored OAuth rows 是 v1 单账号判定与 Header identity 来源：0 行未登录，1 行可继续，超过 1 行明确拒绝模型调用；唯一行仍必须具有 accountId。`active` 仅表示指定 session 的 sticky row，不代表 stored credential 数量。不得自动选择、轮换或删除其他凭据。

M0 1.5 与后续回归验证了 serial normal、same-row refresh、401/retry、retained A→B、abort、sole-account guard 和 Header 路径零 `getOAuthAccess()`。新增 real-AuthStorage 契约保持 lifecycle session A，使用 request session B 选择 B 并成功请求；provider 回归确认同一 AuthStorage 的第二 session 不会 clobber 在途 binding，Header 期间 row 变化仍拒绝。

这些证据不证明 Bearer 选择与 Header lookup 原子同源。AUTH-04 和新发布在 OMP 18.2.6 上 BLOCKED；不 patch OMP、不恢复全局 fetch hook、不自建 transport、不放宽规格。

### D4 — Logout 和 Billing 共享宿主生命周期

通过 M0 确认的公开 provider-scoped credential 删除入口实现 logout，不直接编辑宿主存储。顺序：失效 UI generation → 删除 WorkBuddy credential → 清理 widget/status → 失效认证运行态 → 按实测需要更新目录。失败必须报告，不把删除异常吞掉后显示成功。

Billing 通过宿主公开认证解析获得有效 credential；`UsageCredential.accountId` 映射为现有协议要求的 Billing `X-User-Id`，orgId 用于 report scope，除非 live evidence 证明需要，不新增 Billing `X-Enterprise-Id`。不调用旧 `current/resolveCred`，不创建自己的 refresh 去重器。刷新失败在 Billing 面表现为 unavailable，不能吞掉真正 Chat 的认证错误。桌面凭据和客户端数据均不修改。替代方案“仅 unlink 插件文件”无效且会重新回退 Desktop，删除。

### D5 — 类型化模型能力，不机械搬字段

`models.ts` 解析产品配置；`buildOmpModels()` 返回实际 `ProviderModelConfig` 支持的字段，provider/baseUrl 等由 Provider 注册层提供，最终 resolved Model 必须完整。不得把 V2 §6.2 的完整模型属性机械全部塞进 ProviderModelConfig；cost 按实际 schema 提供但不作为免费证据。

thinking 使用 canonical metadata，effort 只来自可信配置/证据，明确 requiresEffort/off。不再默认“supportsReasoning=true 就给全部档位”；缺 effort 列表只使用经验证的宿主默认或明确受限状态。Vision 依据 Gateway，可必要覆盖 `compat.stripImageInput=false`，通过真实图片证实。context/maxTokens 的 clamp 在目录和请求保持一致，较小预算不被上调。

free 判定只采用可信计费证据。有效目录无免费条目时返回空集合，不补 `FREE_IDS`；有效缓存的已知付费/未知结论优先于 builtin。缓存缺失/损坏时允许 builtin 作为目录来源，但硬编码 `x0.00` 并不自动证明当前免费；没有独立可靠证据则 free 仍为空。all 指当前可识别模型，不声称绝对完整。替代方案“免费列表为空就回退内置免费 ID”会产生计费风险，删除。

### D6 — Dynamic Model ADR 是有界实施分支

M0 调查了已有 upstream 实现、仓库资料、授权可访问的 Desktop 产品配置以及 OMP 18.2.6 动态发现契约。结论记录于 `docs/omp-port/adr-dynamic-models.md`：**选择 Path B（Desktop product cache → builtin fallback）**。

未发现具有稳定文档、响应契约和身份生命周期证据的国际版 authenticated product/model endpoint。OMP `fetchDynamicModels(apiKey)` 只接收 API key，不能携带本项目要求的 accountId/orgId/durable credential/session identity；其 24 小时 provider cache 也不按账号或 free/all scope 区分，因此 v1 不采用 Path A。Desktop 产品元数据读取与 Desktop credential 读取是不同权限边界，后者仍禁止。

有效 Desktop 目录不会因 free 为空而被 builtin 扩宽；已知付费与未知价格不得进入 free。来源显示为 `desktop-cache` 或 `builtin-fallback`。OMP 18.2.6 的静态 `models: []` 不清除旧 overlay，M2 必须先移除旧 Provider/overlay 或使用另一个经验证的清除操作。未来采用 remote 路径需要新 ADR 和 endpoint/identity/cache/live 证据。

### D7 — Gateway patch 必须逐项有证据

`payload.ts` 从 OMP 原生 payload 出发；`before_provider_request` 使用 request-bound `ctx.model.provider`，仅对 WorkBuddy 请求实施有证据的兼容差异。建立 `docs/omp-port/gateway-compatibility-evidence.md`，每条记录：适用模型/版本、未变换失败案例、最小修复、脱敏服务端结果、回归场景。reasoning replay、named tool_choice、DeepSeek clamp、字段清理均是候选，不能仅凭旧代码注释无条件保留。

移除宿主已正确完成的 stream=true、developer→system、标准 effort/max_tokens 和解析逻辑。默认不注入 system prompt；仅真实 Gateway 无 system 必失败时允许最小修正并记证据。reasoning 清理保留 tool_call_id、tool result association、assistant tool replay，完成下一轮而非仅测试 JSON 变换。

OMP 18.2.6 将本次 provider request 的精确 Model 作为 hook `ctx.model`，因此同 ID 的其他 Provider 可可靠排除。Hook handler 异常会被宿主记录后吞没，不能承担 fail-closed 安全约束；活动 scope、切换期及 retained-model 阻断位于 WorkBuddy-bound `Model.resolveHeaders`。authenticated `streamSimple()` 的宿主凭据选择先于该 resolver；revision 仍在既有 resolver 与 HTTP transport 前复核。不得为隔离自建 transport。

### D8 — Credits / Usage ADR 与可选管理面

M0 结论记录于 `docs/omp-port/adr-credits-usage.md`：**选择宿主 UsageProvider**。18.2.6 的 Usage schema 可表达 credits 的 used/limit/remaining、accountId/orgId、tier、notes/metadata/raw，并向 fetcher 提供标准化 OAuth credential、AbortSignal 与宿主 fetch 生命周期；`ProviderConfigInput.usage` 由 AuthStorage 管理。

M4 将现有 `POST /v2/billing/meter/get-user-resource` 适配为一个 WorkBuddy UsageProvider，使用 accountId 发送 `X-User-Id`，并显式设置 `retainLastGoodOnFailure: false`。只有显式 `/workbuddy` 消费 normalized report 并临时挂载紧凑 Widget；插件不占用 OMP status line，session/turn 生命周期不主动刷新 Billing。Billing 不调用旧 `current/resolveCred`，不读取 Desktop/插件凭据，不创建 refresh 去重器；唯一刷新实现仍是 M1 OAuth callback。积分状态区分 available / unavailable / 未查询，parse 失败、5xx 或 timeout 必须成为 unavailable，不得显示零或 last-good 旧值。

### D9 — 目录和 UI 是不同状态边界

Scope 更新先构建候选目录与 ID Set。非空候选直接 `registerProvider`，利用 OMP 对同 source overlay 的原位替换，避免无谓拆除 OAuth/runtime 状态；只有空候选先 `unregisterProvider` 清除 18.2.6 不会被 `models: []` 覆盖的旧行。外部注册成功后原子持久化设置，最后提交内存目录、selector/请求 ID；注册或写设置失败必须恢复旧 Provider，且不得提交或虚报新 scope。当前模型被移除时明确要求重选，并在用户选择范围内模型前阻断 retained Model object 的后续 WorkBuddy transport；绝不自动换付费或任意 fallback。
`stateGeneration` 是仅针对异步详情的内存计数，下一 turn、logout/account switch/scope/session teardown 递增；完成后比对 generation、当前模型和活动会话再应用结果。`session_start` / `session_switch` 清除旧显示，`turn_start` 收起显式详情并使待处理详情刷新失效，迟到结果不得重绘；调用方 AbortSignal 不保证终止宿主共享的 in-flight 请求。不使用计时器。无 UI 时所有交互调用跳过，认证/注册/hooks 始终可用。

设置只保存 scope 等非敏感值，使用宿主 getAgentDir 等实际公开目录规则，默认 `~/.omp/agent` 并尊重 `PI_CODING_AGENT_DIR`，不引入新环境变量。

### D10 — 可取消的 OAuth 协议轮询

将宿主支持的取消信号和扩展/session 关闭连接到 AbortController；HTTP 请求和间隔等待都可取消，取消后忽略迟到成功结果。维持总轮询截止时间，分类拒绝/超时/取消/网络/5xx/429。只有 authorization polling 对有效 Retry-After 在剩余轮询时间内等待后继续；一次性的 login-start 和 refresh 遇到 429 时返回 `rate_limited`，不在插件内建立独立 retry loop。这是 Plugin Auth 协议调度，不是重写 Chat Retry。所有错误输出先去秘密，保留状态与可行动原因。

### D11 — 按协议边界模块化

| 文件 | 单一职责 |
|---|---|
| `extensions/workbuddy.ts` | composition root、事件和命令装配；不再承载全部业务 |
| `src/auth.ts` | credential mapping、login callbacks、refresh、identity validation |
| `src/provider.ts` | ProviderConfig、OAuth adapter、modifyModels、注册/重注册 |
| `src/workbuddy-api.ts` | 官方 Plugin Auth/Refresh/Billing/选定 Product Config HTTP 协议；不得依赖 UI，不发送 Chat |
| `src/models.ts` | 配置解析、scope、thinking/vision、catalog |
| `src/payload.ts` | 有证据的 Gateway delta |
| `src/credits.ts` | Billing response 与积分状态 |
| `src/settings.ts` | scope/non-sensitive settings；不接触 Token |
| `src/ui.ts` | command-scoped widget/notify/select 和 generation-aware rendering；不挂载 status line |

随里程碑迁移现有实现并更新调用者，不先建立无用抽象或占位模块。更新 tsconfig 让实际实现和必要 contract tests 接受真实类型检查；扩展目录仅有入口，避免 helper 被当扩展加载。

### D12 — 验证和证据组织

unit：映射/身份/模型/免费过滤/payload 纯行为；contract：真实 OMP ProviderConfig/OAuth/modifier/hook；integration：真实 OMP 注册、持久化、重注册、logout、subagent；Live：真实 OAuth/Chat/Refresh/Vision/Tools/Credits。现有 scope/session-start 测试迁移到新边界，保留行为而不再写旧凭据；临时目录、mock 和计时资源须隔离并清理。

V2 §13 的十二类长期回归全部保留，不用“字段被转发”或源码字符串代替行为。脱敏观测不能依赖生产全局 fetch 拦截；使用宿主允许的诊断和隔离测试观测请求，负例确认零 Chat 请求，Live 正例使用官方地址。不得把“测试 seam 可记录”写成“真实 Gateway 已通过”。

正式 `docs/omp-port/release-evidence.md` 记录 V2 §11 的十一项环境/结果字段及 §10 的全部矩阵，引用规格 ID、实现和测试证据；Live 未执行永远不是 PASS。P1 所有能力仍是 v1 gate。

## Risks / Trade-offs

- [宿主请求时 Token 与目录投影不是同一个 callback] → M0 验证换号、刷新、旧引用及子运行态；三层验证不能单独证明原子性，必须真实请求证据，无法满足即阻断，不放宽 AUTH-04。
- [公开 API 无法枚举多个有效账号] → 按 AUTH-07 记录检测限制，强制顺序换号矩阵；不宣称支持 rotation，不接受错配。
- [M0 与 M1 都涉及 OAuth] → M0 是隔离宿主契约实验，M1 是正式实现和完整真实链；M0 可复用现有协议作探针，但不能以实现未完成跳过宿主验证。
- [在线目录/Usage 尚无实际端点/能力证据] → D6/D8 已定义调查、选择和对应任务；保持决策待实测而不是伪造 API。分支不改变安全和对外验收标准。
- [空免费集合与 builtin fallback 容易冲突] → 目录 fallback 不等于免费 fallback；有效目录空免费必须保留，未知永不免费。
- [宿主更改 request-bound hook context 或异常策略] → 固定 OMP 18.2.6，使用真实 `ExtensionRunner` 契约测试精确 `ctx.model` 与异常吞没行为；Provider 识别留在 hook context，fail-closed scope guard 留在 WorkBuddy resolver，不改 transport。
- [详情自动收起时宿主 Billing 可能仍在运行] → 下一 turn 是明确用户边界；generation 使旧详情刷新失效并丢弃迟到结果，不宣称调用方 AbortSignal 必然终止宿主共享请求；用户可再次运行 `/workbuddy`，不使用易竞态的计时器。
- [真实账号或某模型暂不可用] → 相应 live gate 保持未完成，不以 Mock 或删验收范围代替。
- [未提交用户修改与基线混淆] → 保存差异证据、不覆盖或代提交用户工作；M0 冻结后重估，不承诺总工期。

## Migration Plan

1. 仅在用户启动 apply 后进入 M0，保存准确基线，修当前加载问题并证明公开宿主契约，完成六项文档与两项 ADR。M0 预算 1–2 工程日，之后重估 M1–M5；原 12–18 日仅参考。
2. M1 单一负责人串行完成 credential/header/logout 共享状态链；一个稳定真实模型打通 V2 §23 全链再扩展。
3. M2/M3 仅在 credential、Provider 注册、model ID contract 固定后可局部并行；共享 `provider.ts` 和入口有一个集成负责人，阶段验收仍按顺序。
4. M4 完成管理面非阻塞与竞态处理，M5 执行全部发布矩阵和保留回归，再完成 README、版本/发布说明和临时实验文件清理。
5. 用户迁移需 `/login workbuddy`，不自动读取、导入或删除旧插件/Desktop 凭据；scope 可重新选择，不静默搬旧认证。
6. 发布失败时停止分发并禁用/卸载该扩展或回到明确验证过的 OMP 兼容发布；当前未通过的 Pi Fork 不冒充可用回滚版本。插件不得自动回滚宿主 credential 到旧文件，桌面登录保持原状。正式包版本按已发布历史单调推进，不因功能名 v1 把 1.1.5 降为 1.0.0。

## Planning Clarifications

- V2 明确授权 M0 ADR 分支，因此此处规划决策机制与两条实施路径，而不是把尚未运行的架构实验宣称完成。
- V2 §6.2 的完整模型语义落在 resolved Model；注册对象仍遵守真实 ProviderModelConfig，避免为字段列表引入编译错误。
- V2 最初记录的同名 ID 风险已由 OMP 18.2.6 request-bound `ctx.model.provider` 与 WorkBuddy `resolveHeaders` 分层解决：modifier/resolver 对非 WorkBuddy 严格隔离，payload hook 只做有证据的 WorkBuddy wire 兼容。
- OpenSpec 最初规划轮次只产生 planning artifacts；`coverage.md` 仅记录规划覆盖，不是 M0 Requirement → Implementation → Test 的实验通过证据。apply 阶段的完成状态以 `tasks.md` 为准。
