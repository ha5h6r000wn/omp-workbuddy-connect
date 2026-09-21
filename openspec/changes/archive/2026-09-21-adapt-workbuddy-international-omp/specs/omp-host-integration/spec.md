# Spec Delta

## Purpose

定义 WorkBuddy 国际版扩展在官方 OMP 18.2.6 上的安装、宿主契约、基线可复现性及阶段准入条件，确保适配依赖经过验证的公开能力，而不是 Pi 兼容假设或对宿主的私有修改。

## ADDED Requirements

### Requirement: HOST-01 Reproducible development baseline
交付 SHALL 记录 Fork 仓库、实际开发分支、精确提交，OMP 18.2.6 仓库与精确提交，以及 Fork 所基于的 upstream 精确提交。未提交修改 SHALL 与提交基线分开记录，核心 API 验证依赖 MUST 固定到 18.2.6，不得使用通配版本代替已验证基线。

#### Scenario: Baseline includes local modifications
- **WHEN** 开始 M0 且工作区相对记录的 Fork 提交存在修改
- **THEN** Baseline Manifest 分别记录提交标识与工作区差异证据，不将 HEAD 描述为全部当前代码，也不覆盖用户修改

#### Scenario: Development dependency resolution
- **WHEN** 从锁定依赖安装并执行核心 API 类型验证
- **THEN** 使用可复现的 OMP 18.2.6 依赖，结果能够关联到宿主和扩展精确提交

### Requirement: HOST-02 Native unmodified host support
扩展 SHALL 使用原生 OMP manifest、包和 Provider/OAuth API，在未修改的官方 OMP 18.2.6 中安装和加载；Provider 标识 SHALL 为 `workbuddy`，Chat base URL SHALL 为 `https://www.workbuddy.ai/v2`。不得要求宿主补丁、legacy Pi shim、国内版端点或自定义 Chat transport。

#### Scenario: Official host loads the extension
- **WHEN** 在官方 18.2.6 安装并启动扩展
- **THEN** 类型检查为零错误，且没有 extension load error、unknown provider field、unknown event 或 module resolution error

#### Scenario: International-only routing
- **WHEN** 已认证用户发送 WorkBuddy Chat 请求
- **THEN** 请求经宿主 Provider 链路到国际版 `/v2/chat/completions`，不使用代理绕过宿主，也不访问国内版服务

### Requirement: HOST-03 Evidence-based public API contract
M0 SHALL 以实际类型、源码及真实 OMP 行为验证 API Compatibility Matrix。必须确定重复登录属于 replace/append/rotate 中何种行为，并验证持久化、刷新、删除、重启恢复以及 modifier 的完整目录输入、重建、凭据更新、异常、重注册旧模型引用和 subagent 行为。

#### Scenario: Credential behavior is inspected
- **WHEN** 在隔离的真实 OMP 配置中验证登录、重复登录、刷新、删除和重启
- **THEN** Credential Behavior Note 保存实际行为和证据，单账号策略依据结果选择，而不依据类型推测

#### Scenario: Registry projection fails or becomes stale
- **WHEN** modifier 抛异常，或凭据变化、registry rebuild、Provider 重注册后仍存在旧模型引用
- **THEN** 记录宿主实际如何处理异常及更新引用，并证明所选集成路径不会发送缺失或旧账号身份；不能证明时阶段不通过

### Requirement: HOST-04 Architecture decisions before feature expansion
M0 SHALL 输出 Dynamic Model ADR 和 Credits / Usage ADR，分别基于稳定官方 authenticated product/model endpoint 与宿主 Usage 对 account/remaining credits/plan/identity 的表达能力做决策。在线目录与 UsageProvider 不是无条件必做，也不得未经评估固定延期。

#### Scenario: Stable authenticated model endpoint is available
- **WHEN** M0 有可靠性与能力证据支持官方在线目录
- **THEN** ADR 记录原生动态发现及宿主缓存是否纳入 v1 的决定、证据和范围；选定后只实现被批准路径

#### Scenario: No reliable online model endpoint exists
- **WHEN** M0 无法确认稳定官方在线目录
- **THEN** ADR 选择 Desktop cache 到 builtin fallback 的目录策略，并将来源与缓存依赖暴露为已知限制

#### Scenario: Usage lifecycle cannot meet billing needs
- **WHEN** 宿主 Usage 无法合适表达必要积分信息或获得身份
- **THEN** ADR 选择独立 WorkBuddy Billing client，但仍使用宿主 credential 和刷新生命周期

### Requirement: HOST-05 Milestone admission gates
M0 SHALL 交付 Baseline Manifest、API Compatibility Matrix、Credential Behavior Note、两项 ADR、Requirement → Implementation → Test Matrix。精确基线、零类型错误、官方加载、OAuth/logout/modifier 契约以及 subagent/headless 加载全部确认后才进入 M1；后续阶段 SHALL 按 M1 认证、M2 模型、M3 Gateway、M4 管理、M5 发布的门槛推进。

#### Scenario: M0 evidence is incomplete
- **WHEN** 任一宿主认证删除路径或 subagent/headless 加载行为尚无证据
- **THEN** M0 不被标为通过，后续业务功能开发不以推测绕过该门槛

#### Scenario: First functional milestone completes
- **WHEN** 一个真实模型完成登录、正确身份 Streaming、强制刷新、重启、退出与 A 到 B 换号
- **THEN** 才将 M1 判为完成，而不是仅以 Provider 注册或模型可见判定成功
