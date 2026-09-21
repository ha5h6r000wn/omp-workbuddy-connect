# Tasks

## 1. M0 — 冻结基线与验证宿主契约

- [x] 1.1 保存 `docs/omp-port/baseline-manifest.md`：Fork 仓库/实际分支/exact SHA、upstream exact SHA、OMP 18.2.6 exact SHA、完整工作区差异和运行环境；核对 design 中观测值并明确未提交用户修改，不把 HEAD 当完整工作区。（HOST-01）
- [x] 1.2 修复 `loginWorkBuddy` 函数闭合等现有加载问题，校准 manifest/import/类型导出、固定 OMP 开发依赖与锁文件为 18.2.6，更新 tsconfig 覆盖实际模块；以模块导入和 `tsc --noEmit` 零错误验证，不用 any/抑制绕过契约。（HOST-01/02）
- [x] 1.3 按 design D1 完成 API Compatibility Matrix，移除 Provider 顶层 name（若存在）、refreshModels、before_provider_headers、model_select、Marker 等不支持契约，区分合法 OAuth name；以真实类型和官方加载无未知字段/事件/模块错误验证。（HOST-02/03）
- [x] 1.4 在隔离官方 OMP 配置中用最小协议探针验证 `/login workbuddy`、同身份 replace、异身份 append/rotation、持久化、refresh、provider-scoped 删除及重启；保存 `credential-behavior.md`，确认 `listOAuthAccounts()` 可检测多个 stored OAuth credential，且不读取用户真实存储做破坏性实验。（HOST-03、AUTH-07）
- [x] 1.5 完成 Request Identity Binding Decision：保留 modifier 六项既有证据，验证 `modifyModels()` 安装并组合 `Model.resolveHeaders()`、从公开 ExtensionContext 安全捕获 registry/AuthStorage、`getOAuthAccess()` 的 request-boundary 行为，以及 normal/forced refresh/401 retry/logout A→B/abort 下实际出站 Bearer、UserId、EnterpriseId 绑定同一 durable credential row/account identity；失败则依次验证公开 `ExtensionAPI.setModel()` rebind 与 reload/new-session fail-closed，更新 `adr-request-identity-binding.md` 后才解除 M0 阻断。（HOST-03、AUTH-04/05/06/07）
- [x] 1.6a 验证真实 SDK headless parent 与 child-shaped session 的扩展、OAuth、payload hook、公开 abort/dispose/shutdown 契约；保存 `headless-behavior.md`，证明认证协议不需要交互 TUI。（HOST-03、REL-01）
- [x] 1.6b 使用 actual OMP Task executor + synthetic/dummy provider 验证 role model、独立扩展绑定、payload hook 与取消/shutdown；不得用 child-shaped SDK session 代替 Task runtime，authenticated WorkBuddy Task E2E 留在 M5。（HOST-03、REL-01）
- [x] 1.7 调查现有 upstream/官方资料与授权可访问的稳定 authenticated product/model API，交付 `adr-dynamic-models.md`；记录 endpoint 证据、identity 可用性、原生缓存和空 scope 可行性，明确 D6 的 A/B 选择及未选理由。（HOST-04、MODEL-06）
- [x] 1.8 评估 UsageProvider 对 account/remaining credits/plan/identity 与宿主认证生命周期的表达，交付 `adr-credits-usage.md`；以真实类型/协议证据选择宿主 Usage 或独立 Billing，明确无第二刷新器。（HOST-04、UX-03）
- [x] 1.9 建立 `requirement-implementation-test-matrix.md`，将本 change 全部 requirement ID 关联目标模块、四层验证与阶段 gate；检查每项均有验证入口，未运行保留未通过状态。（HOST-05、REL-03/05）
- [x] 1.10 验收 M0 六项交付与 gate：exact commits、零类型错误、官方加载、OAuth/logout/modifier 及 headless/subagent 契约证据全部齐全；仅通过后进入 M1，并据发现重估 M1–M5，不承诺原 12–18 日总工期。（HOST-05）

## 2. M1 — 完整认证与身份不变量

- [x] 2.1 从入口提取 `src/auth.ts`、`src/provider.ts`、`src/workbuddy-api.ts` 的实际职责，建立完整凭据映射/边界校验；验证 access/refresh/expiry/durable uid 缺失逐项拒绝，enterpriseId 缺省不伪造 orgId，真实 email 才入 email，nickname 不污染身份，domain 不控制路由。（AUTH-02；D2/D11）
- [x] 2.2 接通正式 `/login workbuddy` 与 OMP 持久化，删除正常请求的 saveOwn/current/resolveCred、Desktop/环境文件回退和旧刷新链；保留行为测试证明仅有旧凭据时仍未登录、重启仅恢复宿主凭据。（AUTH-01/02）
- [x] 2.3 实现宿主 refreshToken callback，仅从传入 credential 构造官方刷新请求并保留身份；保留刷新后 identity 回归，验证有效 Token/expiry、无效 refresh、缺身份和身份矛盾均无错误 fallback，缺省新 refresh 的处理有协议证据。（AUTH-03）
- [x] 2.4 配置固定国际版 Headers，用 modifier 为 WorkBuddy 行安装 M0 选定的 credential-aware request identity binding，组合而非覆盖既有 resolver；保留 OpenAI/Anthropic 混合目录不变回归，并检查首个实际请求固定 Header、用户身份 Header，以及 enterprise/no-enterprise 分支正确。（AUTH-04/06）
- [x] 2.5 在 getApiKey 与 request identity resolver 双边校验身份和单 stored account，不手动注入 Chat Authorization；非法/歧义时 modifier 返回 foreign rows 隐藏 WorkBuddy，同时请求边界再次 fail closed，覆盖 modifier 异常 fallback 且零 Chat 请求。（AUTH-05/06/07）
- [x] 2.6 按 M0 证据实现单账号限制：`listOAuthAccounts('workbuddy')` 超过一个 stored OAuth credential 时明确拒绝调用，不自动选择、轮换或删除；验证 `active` 仅为 session sticky 标志，不能用于计数。（AUTH-07）
- [x] 2.7 实现 provider-scoped logout：先失效异步 generation，再删除宿主认证、清理状态并使 request-boundary identity resolver 不可继续取得旧身份；验证失败不虚报成功，Desktop credential/客户端数据不变。（AUTH-08、UX-02）
- [x] 2.8 按 M0 ADR 打通 normal/refresh/retry/logout/换号的 request-boundary durable identity binding，验证 refresh/retry 可换 Bearer 但保持同一 row 身份，已有会话及新 subagent 在换号后均获取 B；若采用 setModel fallback，覆盖 main/child/resume/task/headless，保留迟到 A 结果不恢复旧认证的回归。（AUTH-04/07）
- [x] 2.9 将用户取消、session abort、extension shutdown 接入 OAuth HTTP 请求和轮询等待；验证三类取消均停止后续轮询、不持久化迟到成功、不遗留定时器。（AUTH-09）
- [x] 2.10 分类授权拒绝、poll timeout、user cancelled、network failure、5xx、429；authorization polling 遵守有效 Retry-After 与总截止时间，login-start/refresh 的 429 单次返回 `rate_limited`，用隔离协议场景验证不同结果和可取消等待，不新增通用 retry。（AUTH-09）
- [x] 2.11 使用一个稳定真实 WorkBuddy 模型完成 fresh login→正确 Bearer/identity→Streaming→强制过期 refresh→restart→logout→B login→existing session/subagent B request；保存脱敏证据，全部通过才完成 M1。（HOST-05、AUTH-01–09）

## 3. M2 — 模型目录与能力契约

- [x] 3.1 提取 `src/models.ts`，迁移 buildPiModels 为 buildOmpModels 并更新所有调用者，以真实 ProviderModelConfig/最终 Model 验证字段分层；对缺 ID、格式错误和非法预算给可诊断结果，不注册无效条目。（MODEL-01；D5）
- [x] 3.2 删除 thinkingLevelMap 和未知能力时全 effort 默认，生成 canonical thinking/required effort/off；验证 minimal/low/medium/high/xhigh/max 仅暴露 Gateway 支持集合、不可关闭模型不发 off、标准 effort 由宿主生成。（MODEL-02）
- [x] 3.3 按 Gateway 生成 text/image 能力，必要时覆盖 stripImageInput；以真实图片输入证明请求未被宿主家族默认规则剥离，而非只验证 UI 标签。（MODEL-03）
- [x] 3.4 将已有且有 Gateway 证据的模型 token clamp 同步到目录/请求，测试高于上限被限制和较小合法预算不被上调，contextWindow/maxTokens 不虚报。（MODEL-04、GATE-01）
- [x] 3.5 重写免费过滤：已知付费和未知价格排除，有效目录免费为空不补 FREE_IDS；保留 paid/unknown/empty 三类永久回归，并证明 cost 零占位不用于宣称免费。（MODEL-05）
- [x] 3.6 实现 M0 Dynamic Model ADR 选中的唯一目录路径：A 使用 fetchDynamicModels/宿主缓存并验证 identity/scope/空集合；B 使用 Desktop product cache→builtin fallback 并验证缺失/损坏缓存及免费证据约束；两种选择均显示准确 model source，未选分支在 ADR 记理由、不写空实现。（MODEL-06；D6）
- [x] 3.7 完成 Provider 重注册与 scope 提交：同步模型、ID Set、selector 与持久化；验证下一次显式详情反映新范围、空数组真正替换旧目录、注册/设置失败不虚报成功，并保留 credential unchanged 永久回归。（MODEL-07）
- [x] 3.8 当前模型被新 scope 移除时提示用户重选，并在选择范围内模型前阻断该 retained Model object 的后续 WorkBuddy 请求；用真实 OMP 验证 all→paid model→free(empty)→next Chat 在 transport 前失败且 WorkBuddy HTTP 请求数为零，不自动选择付费或任意 fallback。（MODEL-07）
- [x] 3.9 提取非敏感 `src/settings.ts`，采用宿主 agent 目录规则与 PI_CODING_AGENT_DIR；验证默认 .omp 路径、scope 及 empty free 重启恢复且文件无 Token/credential。（MODEL-07、UX-07）
- [x] 3.10 验收至少三个模型的 metadata、thinking、Vision、context/max tokens、free/all/empty、scope restart 和重注册不改 credential；保存目录来源与真实模型 ID 证据后通过 M2。（MODEL-01–07）

## 4. M3 — 最小 Gateway 兼容与工具闭环

- [x] 4.1 为 reasoning replay、tool_choice、token clamp、unsupported fields 逐项建立 `gateway-compatibility-evidence.md`，记录删除后失败案例、脱敏响应、适用模型/版本及最小修正；删除没有可复现必要性证据的 transform。（GATE-01）
- [x] 4.2 提取 `src/payload.ts`，移除宿主已处理的 stream/role/standard effort/max_tokens 重复处理；默认删除自动 system prompt，仅在真实缺 system 失败证据成立时最小保留，验证用户 prompt semantics 不被任意改变。（GATE-02）
- [x] 4.3 保留 `before_provider_request`，使用 request-bound `ctx.model.provider` 仅对 WorkBuddy 实施有证据的 payload 兼容；把活动 scope/切换期阻断放到 WorkBuddy-bound `resolveHeaders`，验证当前与历史同 ID 的其他 Provider 完全不变、retained WorkBuddy 模型在 transport 前失败。（GATE-03）
- [x] 4.4 对证据要求的 reasoning cleanup 保留永久回归，验证普通消息、assistant tool calls、tool_call_id 和 tool results 关联完整，真实下一轮能使用工具结果。（GATE-04）
- [x] 4.5 验证 auto/named tool_choice 的 WorkBuddy 规整、arguments streaming、单工具、连续工具、多工具及支持时 parallel tools，完成工具执行→结果回送→下一轮回答，而非只验证参数拼接。（GATE-05）
- [x] 4.6 用宿主原生 openai-completions 验证 text/reasoning/tool deltas、usage、DONE、HTTP error、Abort、Retry；证明无插件 SSE/tool parser、双重重试或自定义 Chat HTTP 路径。（GATE-06）
- [x] 4.7 汇总普通对话、reasoning history、named/sequential/multi 工具、参数流、abort/error/retry 和 request-bound Provider 隔离证据；resolver/hook 边界加固后已在隔离 profile 重复 Deepseek forced named-tool 场景并登出，所有 patch 均关联服务端 case 后通过 M3。（GATE-01–06）

## 5. M4 — Commands、Credits 与可选 UI

- [x] 5.1 按 M0 ADR 接通 WorkBuddy UsageProvider，设置 `retainLastGoodOnFailure: false`，从宿主 credential 的 accountId 发送 Billing `X-User-Id`，不读旧文件、不自行 refresh、不在无证据时新增 `X-Enterprise-Id`；成功响应可得账号/积分/套餐。（UX-03；D8）
- [x] 5.2 实现 available/unavailable/未查询状态，拒绝把无效响应解析为零积分或沿用 last-good 旧值；验证 genuine zero、success→5xx、超时、慢响应、解析失败都不破坏正常 Chat。（UX-01/03）
- [x] 5.3 完成 `/workbuddy` 按需详情和 free/all/logout 用户交互，详情包含脱敏 account、credits/plan、scope/model count/model source/provider state，模型名单最多前四项加剩余数量；scope action 不查询 Billing，使用一次性通知且不挂载常驻详情。（UX-01/02）
- [x] 5.4 提取 `src/ui.ts`；默认不挂载 Widget 或 WorkBuddy status line，session/turn 不主动查询 Billing，显式 `/workbuddy` 临时显示紧凑 Widget，下一 turn 收起并使待处理详情刷新失效，迟到结果不得重绘。（UX-03/05）
- [x] 5.5 实现 stateGeneration 与当前模型/活动会话检查，下一 turn、logout、account switch、scope change、session teardown 失效旧请求；验证迟到积分不恢复已收起或退出后的 Widget。（UX-04）
- [x] 5.6 所有 UI 操作以 hasUI 隔离，非 UI 认证/注册/hook 正常装配；保留 headless 无 UI 依赖回归，验证没有 select/notify/widget/status 调用也能运行请求与工具。（UX-06、REL-01）
- [x] 5.7 验收四个命令、Billing 正常/失败/慢、pending credits logout、scope restart、next-turn dismiss、headless 与无 UI 访问后通过 M4。（UX-01–07）

## 6. M5 — Agent、四层验收与发布证据

- [x] 6.1 完成真实 main model 的 chat/thinking/tool/streaming/refresh 场景，保存官方宿主与 Gateway 的请求身份和结果脱敏证据。（REL-01）
- [x] 6.2 配置 task role 为 WorkBuddy 并执行 subagent，验证加载、OAuth、identity、payload hook、Streaming、tool calling、结果返回和 B 登录后无 A 身份；实际 headless 验证加载/认证/模型/请求/工具不依赖 TUI。（REL-01、AUTH-07）
- [x] 6.3 执行 unit/真实类型 contract/真实 OMP integration/WorkBuddy Live E2E 四层验证，确认 V2 §13 十二类永久回归全部存在且行为通过，Mock/fixture/临时目录不读取真实凭据并正确释放资源。（REL-03）
- [x] 6.4 执行完整 Release Matrix：install/type/fresh login/first identity/restart/expired access/invalid refresh/missing accountId/optional-org no-enterprise/A→B/logout/至少三模型/thinking/真实图片/read-grep-bash/sequential-multi/main/subagent/headless/free-all-empty/Billing success-5xx-timeout-slow/isolation/logging；逐例记录结果，必需项不许以 N/A 或 Mock 代替。（REL-02）
- [x] 6.5 审查源码与实际日志、错误、网络、文件和诊断附件，确认 Token/Authorization 不入日志、仓库、项目或第三方，identity 输出脱敏，网络只到功能所需官方国际端点，Desktop 数据未改变。（REL-04）
- [x] 6.6 保存 `release-evidence.md`：OMP version/commit、extension version/commit、Node/Bun runtime、日期、账号类型、模型 IDs、矩阵结果、known limitations、脱敏证据；补齐 Requirement→Implementation→Test 实际定位，未运行/失败不得标通过。（REL-05）
- [x] 6.7 真实冒烟及矩阵通过后完成入口 composition root/模块边界收尾，删除失去用途的旧认证与兼容代码、临时探针和脚本；验证没有生产占位实现、额外 CredentialStore/Transport 框架或被误加载的 helper。（HOST-02、AUTH-01；D11）
- [x] 6.8 更新 README/安装与迁移/目录/环境变量/命令/版本发布说明，明确单账号不容错配、命令级临时 Widget、缓存来源三项限制及 request-bound Provider 隔离行为；检查旧 Pi 安装/旧凭据优先级宣传已移除，包版本不因功能名 v1 倒退。（REL-06）
- [x] 6.9 按 V2 §19 全部条件核签 v1：OMP 零修改、正式安装、AuthStorage 唯一来源、OAuth/refresh/identity/restart、目录/Streaming/thinking/声明 Vision/工具、main/subagent/headless、credits/free-all/logout/isolation/秘密保护均有证据；任一未通过保持发布阻断。（REL-01–06、HOST-05）
