# Spec Delta

## Purpose

定义 WorkBuddy 的命令、积分和可选 UI 管理面，使用户能查看真实账号与目录状态、切换模型范围和退出，同时保证计费故障、迟到异步结果或无交互终端不会破坏核心认证及模型调用。

## ADDED Requirements

### Requirement: UX-01 Management command reports truthful state
`/workbuddy` SHALL 按需显示 account、credits、plan、scope、model count、model source 和 provider state。详情 SHALL 使用紧凑 Widget，不得占用 OMP status line；模型名单最多展示前四项和剩余数量，完整模型选择留给 `/model`。没有当前有效积分结果时 SHALL 显示 unavailable/查询失败，不把异常伪装成零积分，也不得在请求失败后把宿主 last-good cache 当作当前结果；身份必须脱敏，昵称缺失可使用脱敏账号。

#### Scenario: Status with available credits
- **WHEN** 已登录用户执行 `/workbuddy` 且积分接口成功
- **THEN** 展示账号、真实积分与套餐、范围、模型数量、目录来源和 Provider 状态

#### Scenario: Status with billing error
- **WHEN** 积分接口 5xx、超时或无法解析有效结果
- **THEN** 状态说明积分不可用而不是 0 credits 或上一次成功的旧值，其他已知状态仍可查看

### Requirement: UX-02 Required scope and logout commands
系统 SHALL 支持 `/workbuddy free`、`/workbuddy all`、`/workbuddy logout`，分别遵守目录范围一致性及 provider-scoped logout 契约。切换不触发重新登录或 Billing 查询；scope 命令以一次性通知报告结果，不挂载常驻详情。logout SHALL 先使旧异步状态失效，再删除认证、清理显示并更新 Provider 状态。

#### Scenario: Scope commands preserve authentication
- **WHEN** 已登录用户执行 free 或 all
- **THEN** 可选择模型与识别集合反映新范围，设置持久化且 OAuth credential 不变；下一次 `/workbuddy` 显示新范围

#### Scenario: Logout fails to delete credential
- **WHEN** 宿主 credential 删除失败
- **THEN** 命令报告失败而不虚报已安全退出，旧积分结果不能恢复 UI，用户能够采取重新退出措施

### Requirement: UX-03 Optional billing never blocks critical plane
积分 SHALL 使用宿主 WorkBuddy credential 和刷新生命周期，不读取旧凭据或自行刷新 Token。WorkBuddy UsageProvider SHALL 设置 `retainLastGoodOnFailure: false`，将 accountId 映射为 Billing `X-User-Id`，且没有 live 证据时不得擅自发送 Billing `X-Enterprise-Id`。`session_start` / `turn_start` SHALL 不主动查询 Billing；积分、Widget、TUI 不可用 SHALL 不阻塞 session startup 或正常 Chat。

#### Scenario: Billing is slow or unavailable
- **WHEN** 用户执行 `/workbuddy` 后积分请求挂起、超时、5xx，或 UI 渲染失败
- **THEN** session 和有效认证下的 Chat 继续，不等待 Billing 网络完成，也不把 Billing 错误传播为模型认证失败

#### Scenario: Billing needs renewed credentials
- **WHEN** 积分查询时宿主认证需要刷新
- **THEN** 使用宿主公开认证生命周期获得同一账号凭据，插件不产生第二条 refresh 或 Desktop fallback 链

### Requirement: UX-04 Stale async results cannot restore old state
下一次 turn、logout、账号切换、scope 变化与 session teardown 后，旧异步结果 SHALL 失效；结果应用时 SHALL 检查当前账号、会话、范围和显示条件，不让旧账号积分恢复 Widget 或登录状态。

#### Scenario: Account and scope change during billing
- **WHEN** A 的积分查询未完成时切换到 B 或修改 scope
- **THEN** A 或旧范围的迟到结果被忽略，Widget 不显示旧身份或覆盖新目录状态

#### Scenario: Session closes or model switches away
- **WHEN** 积分查询期间会话关闭或当前模型离开 WorkBuddy
- **THEN** 后续结果不会在已结束会话或非 WorkBuddy 会话中重新显示 Widget

### Requirement: UX-05 Command-scoped lifecycle display
WorkBuddy SHALL 默认不挂载 Widget 或 status line。只有显式 `/workbuddy` SHALL 显示详情；下一次 `turn_start` SHALL 同步清除该 Widget 并使待处理详情刷新失效，迟到 Billing 结果不得恢复 UI，不使用计时器。调用方 AbortSignal 不保证终止宿主共享的 in-flight Usage 请求。`session_start` 与 `session_switch` SHALL 清除旧显示且不主动刷新 Billing。

#### Scenario: Show and dismiss WorkBuddy detail
- **WHEN** 用户执行 `/workbuddy`，随后开始下一次 turn
- **THEN** 命令显示紧凑详情；下一 turn 清除 Widget，迟到积分不得重新显示，OMP status line 始终不被 WorkBuddy 占用

### Requirement: UX-06 Headless needs no UI
Headless 或 subagent 中 auth、model、payload、transport SHALL 独立工作；没有 UI 时 MUST NOT 调用 select、notify、setWidget 或 setStatus 等交互能力来完成认证或请求。

#### Scenario: Non-interactive model execution
- **WHEN** 有宿主凭据的无 UI 进程加载扩展并发起模型及工具请求
- **THEN** 认证、模型解析、payload 和 transport 均正常，无任何 UI 访问依赖

### Requirement: UX-07 Non-sensitive settings follow host directories
scope 及非敏感设置 SHALL 使用 OMP agent 目录规则，默认 `~/.omp/agent` 并尊重 `PI_CODING_AGENT_DIR`，不得发明 `OMP_CODING_AGENT_DIR` 或保存 Token/credential；正常重启 SHALL 保留 scope。

#### Scenario: Custom agent directory and restart
- **WHEN** 用户设置 `PI_CODING_AGENT_DIR`、切换 scope 后重启
- **THEN** 从该宿主目录恢复非敏感设置，不写入项目目录或旧 `.pi/agent` 默认路径，不保存认证秘密
