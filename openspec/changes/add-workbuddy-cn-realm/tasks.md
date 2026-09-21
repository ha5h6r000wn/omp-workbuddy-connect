# Tasks

## 1. M0 — 冻结基线与中国站协议证据

- [x] 1.1 记录当前分支、工作区差异、OMP/扩展精确版本和国际站回归基线，验证现有类型检查、永久测试及真实国际站冒烟结果均可复现。
- [x] 1.2 建立中国站证据矩阵，逐项记录 Chat/OAuth/Billing endpoint、Origin/Referer/product/domain、Plugin Auth headers、refresh source、pending/status 语义和响应字段的“已观察/推断/未知”状态，并由脱敏抓包或官方客户端证据核对。
- [x] 1.3 在不落盘 credential 的隔离探针与授权中国站账号上验证 login-start、pending poll、授权成功、current account、refresh 和 Chat streaming，保存无秘密的请求/响应形状并证明探针没有国际站 fallback；拒绝、超时、429、取消、restart 和 logout 作为 Provider 客户端行为在 3.2/4.2 验收。
- [x] 1.4 验证中国站目录来源、缓存位置/schema、至少三个候选模型的 thinking/vision/context/maxTokens/价格证据及同 ID 差异；无法确认的能力明确标为不可注册，并用证据矩阵复核。
- [x] 1.5 评估中国站 Billing 与 builtin catalog：只有真实 endpoint、headers、响应语义和模型来源完整时才批准启用，否则形成“不注册 UsageProvider/无 builtin”的明确决定并验证不会发起相应网络请求。
- [x] 1.6 完成中国站准入评审；核心服务协议达到进入 M1/非生产 M2 的证据门槛，未闭环项显式迁入 3.2/3.6/4.2 并继续阻断生产 Provider 装配；保留 `workbuddy` 单站可发布状态并验证仓库没有猜测的 CN endpoint 或 credential 值。

> 1.3 于 2026-09-21 拆分：M0 记录核心真实服务协议并区分已观察/待复核，不在 Provider 尚未实现前要求 OMP 生命周期而形成循环依赖；原有失败分支、持久化、restart/logout、OMP Chat 出站复核要求全部迁入 3.2/3.6/4.2，发布 gate 不降低。
> M0 canonical evidence：[`m0-evidence.md`](./m0-evidence.md)。基线、协议矩阵、脱敏 live probe、模型/价格差异和准入决定随 change 一起归档。

## 2. M1 — 用最小 realm 描述符迁移国际站

- [x] 2.1 增加只读 `SiteDescriptor` 及国际站常量，只包含现有真实差异字段；通过类型检查和 descriptor 单元契约验证无可变 credential/session 状态或通用框架层。
- [x] 2.2 让 OAuth/refresh/Chat header 生成显式接收 descriptor，表达 start request shape/nonce policy、poll timing、refresh source、fixed/credential-derived domain policy 与 identity finalize；覆盖 `X-Auth-Refresh-Source`、Plugin Auth headers 和 pending/status 判定，对照现有 fixture 验证国际站每个出站 URL/header/错误分类不变。保留当前 OMP 下串行账号替换的已知支持边界，不虚构 request-attempt 原子性。
- [x] 2.3 让模型构建、缓存读取、token clamp 与 payload policy 以 provider 为第一键，删除全部裸 `modelId` 全局 workaround；国际站 `deepseek-v4.1-flash` 16k clamp 及其他兼容只进入 Intl descriptor/policy。用相同 model ID 的 CN/第三方 Provider 回归证明请求不被修改。
- [x] 2.4 将 settings、Usage report/filter/summary、Widget key、标签和 state generation 改为 realm 参数，同时保持旧国际站文件、命令和 UI 语义；保留 `02d0937` 的 account snapshot + stale guard 模式，并确保两个 realm 各自在独立 controller/closure 中读取、校验和渲染自身 snapshot。验证重启、Billing 失败和迟到结果测试不变。
- [x] 2.5 从入口提取每 realm 独立装配闭包并仅装配 `workbuddy`，验证 registry、credential authority、AbortController、scope、目录与 UI 状态均非全局共享，官方 OMP 可正常加载。
- [x] 2.6 运行完整国际站 unit、真实类型 contract、官方 runtime integration 和 live OAuth/Chat/refresh/tools/Usage 冒烟；任何行为差异修复后再进入中国站接入。

> M1 于 2026-09-21 验收：`npm run typecheck` 零错误，`npm test` 的 19 个永久回归脚本全部通过；官方 OMP 18.2.7 直接加载当前源码后完成脱敏的国际站 OAuth、Hy3 Chat、真实 Read tool、强制 refresh 后 Chat 与 Usage Widget 冒烟，随后通过 Provider 命令清除隔离凭据。运行未记录 Token、Authorization、OAuth state 或完整账号标识。

## 3. M2 — 接入证据支持的中国站 realm

- [ ] 3.1 只使用 M0 的已观察值和显式未知状态创建非生产 `workbuddy-cn` descriptor；对 descriptor 做快照/契约检查，证明 endpoint candidate、headers、pending/status 和兼容 flags 均可追溯到证据，未复制未验证国际站值，且任何待 3.2/3.6 复核的字段不能被误标为 production-approved。
- [ ] 3.2 接入中国站 OAuth、refresh、request-bound identity 和单账号限制，使用独立 AuthStorage namespace；token success 后必须以 `/v2/plugin/account` finalize durable uid，再交付宿主 credential。证明 token-derived `domain` 可通过宿主语义匹配的持久字段在 restart 后恢复，或以只记录 claim keys/相等性的脱敏 probe 验证 `hostname(jwt.iss) === token-domain` 后再允许确定性 reconstruction；禁止把该等式预设为事实，禁止插件 sidecar credential 与无证据字段挪用。以受控故障覆盖拒绝、超时、429/Retry-After 和取消，以隔离 OMP 覆盖 credential 持久化、restart、logout、双站并发登录/刷新、缺身份/domain fail-closed 与 A→B，且任一站均不读写另一站 credential。
- [ ] 3.3 接入中国站模型目录、能力、free/all 和 provider+model 预算覆盖；分离 catalog eligibility 与代表模型 release validation，以 realm-bound `creditsRaw` 和 `freeEvidence`（explicit-zero/non-zero/unknown）表达原始价格证据。验证缓存缺失/损坏且无 builtin 时返回 unavailable/empty，同 ID 模型仍保持各自 endpoint、metadata、价格证据、scope 和 retained-model 阻断。
- [ ] 3.4 注册 `/workbuddy-cn` 的 status/free/all/logout 与 Provider 专属 settings、Widget key、标签和 generation；验证双站命令、turn/session lifecycle 和迟到异步结果不会互相清理或恢复状态。
- [ ] 3.5 按 M0 决定处理中国站 Usage：未获批准时不注册 UsageProvider，并验证 `/workbuddy-cn` 显示 credits/plan unavailable 且 Billing 请求数为零；获批准时用中国站真实协议完成独立成功/失败/慢响应回归。
- [ ] 3.6 在生产入口装配 `workbuddy-cn` 前，以脱敏 OMP 出站记录复核隔离探针观察到的 Chat 完整 URL/header，并保持单一 request hook 按 `ctx.model.provider` 精确分派；用官方 OMP 加载、混合目录和相同 model ID 场景验证两个 realm 与第三方 Provider 无串扰。URL/header 复核或 3.2 身份前置条件未通过时不得生产注册。

## 4. M3 — 双 realm 验收与发布

- [ ] 4.1 补充最小永久回归：双 AuthStorage、endpoint/header、相同 ID payload/token clamp、cache/settings/scope、Usage/UI generation、logout/cancel 和 retained model 隔离；运行永久回归脚本（每个脚本独立 Bun 进程）并确认资源完整释放。
- [ ] 4.2 执行官方 OMP integration matrix，覆盖两个 realm 同时登录、重启、强制刷新、scope 切换、并发请求、取消、logout、main/Task/headless 与第三方同 ID Provider；复核中国站拒绝/超时/429 分类与 Retry-After 边界，验证可观察的每次 transport 前身份和 realm 绑定正确。当前宿主不给 `resolveHeaders` request-attempt identity 时，明确验证并发布“先完成/取消活动请求，再 logout/login 换号”的支持边界，不把不可证明的并发换号原子性伪装成通过。
- [ ] 4.3 执行中国站真实 OAuth、Chat streaming、reasoning、单/连续/多工具、声明的 vision、至少三个代表模型和 main/Task/headless 矩阵，记录精确客户端/Gateway/account/model 版本及脱敏证据；覆盖 reasoning 消耗 output budget、低预算 `finish_reason=length` 且 content 为空的合法流，以及充足预算正常完成。mock 不计为通过。
- [ ] 4.4 审查源码、网络、日志、设置和诊断附件，验证 Token/Authorization/pending code 不泄露、只访问目标 realm 官方 endpoint、两个 realm 与 Desktop 数据互不修改。
- [ ] 4.5 完整重跑国际站 release matrix；中国站与国际站 gate 均通过后再更新 README、安装/迁移/限制说明和包版本，否则文档与发布元数据保持仅国际站承诺。
- [ ] 4.6 删除临时探针和失去用途的硬编码/共享状态，检查没有跨站 fallback、重复客户端、空实现或通用 Provider 框架，并以类型检查、完整测试和两站 release evidence 作为最终验收。
