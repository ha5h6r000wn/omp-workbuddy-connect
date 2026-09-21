# Spec Delta

## ADDED Requirements

### Requirement: UX-08 Realm-scoped commands and display state
`/workbuddy` 与 `/workbuddy-cn` SHALL 分别管理国际站和中国站。每个命令的 Widget/status key、显示标签、state generation、当前模型检查、scope、目录来源和清理操作 SHALL 绑定目标 Provider；任一 realm 的 command、turn、session switch、logout 或迟到异步结果 MUST NOT 清除、恢复或覆盖另一个 realm 的 UI 状态。

#### Scenario: Both realm details are requested
- **WHEN** 用户先后或并发执行 `/workbuddy` 与 `/workbuddy-cn`
- **THEN** 每个命令只显示自身脱敏账号、scope、目录来源、模型数量和 Provider 状态，且使用独立显示 key 与 generation

#### Scenario: One realm lifecycle invalidates pending UI
- **WHEN** 中国站详情仍在加载时国际站开始下一 turn、切换 scope 或 logout，或反之
- **THEN** 只有触发生命周期变化的 realm 状态失效，另一个 realm 的待处理或已显示详情不被错误清理

### Requirement: UX-09 Usage is enabled only by realm evidence
国际站 UsageProvider SHALL 保持既有 Billing 契约。中国站 Billing endpoint、认证 headers、响应语义和宿主 Usage 表达均有真实证据前，系统 MUST NOT 为 `workbuddy-cn` 注册 UsageProvider 或调用国际站 Billing；中国站管理命令 SHALL 将 credits/plan 明确显示为 unavailable/not supported，同时继续显示已知账号、scope、目录和 Provider 状态。

#### Scenario: China billing is not verified
- **WHEN** 用户执行 `/workbuddy-cn` 且中国站 Billing 尚无完整证据
- **THEN** 不发起任何 Billing 请求，credits/plan 明确不可用，登录、目录和 Chat 不受影响

#### Scenario: International billing remains independent
- **WHEN** 中国站 Usage 不可用、失败或其 UI 被清理
- **THEN** 国际站 UsageProvider 的查询、缓存失效、摘要和错误处理保持既有行为，且不读取中国站 credential
