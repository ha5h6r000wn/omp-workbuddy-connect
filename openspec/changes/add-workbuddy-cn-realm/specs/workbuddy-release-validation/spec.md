# Spec Delta

## MODIFIED Requirements

### Requirement: REL-04 Credential privacy and official endpoints
系统 SHALL 不在日志、仓库、项目目录或第三方服务泄露 access、refresh、完整 Authorization 或 credential，不修改或清除 Desktop 登录状态。网络 SHALL 仅访问请求目标 realm 功能所需且已经证据确认的官方 endpoints；国际站与中国站 credential、headers、pending code 和诊断身份 MUST NOT 交叉发送。诊断允许 provider/realm、model、identity presence/expiry、scope、model count 与 HTTP status，输出 identity SHALL 脱敏。

#### Scenario: Error logging contains sensitive upstream content
- **WHEN** 任一 realm 的 OAuth、refresh、Billing 或 Chat 错误含秘密或身份
- **THEN** 保留有用状态、realm 和错误分类但移除 Token/Authorization，身份脱敏，诊断附件亦遵守同一规则

#### Scenario: Logout and release inspection
- **WHEN** 同时运行国际站和中国站请求并检查网络与诊断产物
- **THEN** 每个请求只访问其官方 endpoint 并携带自身凭据和 headers，没有跨 realm 或第三方凭据上传，Desktop 数据未改变

### Requirement: REL-06 Honest compatibility and limitations
发布文档 SHALL 明示官方 OMP 18.2.6 支持范围、国际站 `workbuddy` 与中国站 `workbuddy-cn` 的独立登录/命令/目录/scope、每个 realm 单账号且不接受身份错配、Widget 生命周期、request-bound Provider 隔离、各 realm 的缓存依赖与 model source，以及中国站 Billing 未验证时的 unavailable 状态。真正多账号、自动站点探测、跨站 fallback、Desktop import、自定义 Provider transport 和即时 model-select UI SHALL 不进入关键路径；动态目录与 Usage 增强按各 realm 实证说明。

#### Scenario: User reads installation and migration instructions
- **WHEN** 用户依据 README 安装、选择 realm 或从旧 Pi/Fork 迁移
- **THEN** 获得正确的 Provider、登录、目录、scope、logout、Usage 和限制说明；既有国际站用户数据继续使用 `workbuddy`，且不会被告知旧凭据或另一 realm 可自动复用

## ADDED Requirements

### Requirement: REL-07 Dual-realm release evidence and regression gate
中国站发布 SHALL 同时具备：精确客户端/Gateway/account/model 版本、脱敏协议证据、真实 OAuth/refresh/restart/logout、Chat streaming、reasoning、tools、声明的 vision、main/task/headless、目录/scope/empty 与跨 realm 隔离结果。Mock 或国际站成功 MUST NOT 替代中国站 live 证据。正式发布还 SHALL 通过完整国际站回归，证明 `workbuddy` 的认证、目录、Usage、UI、payload 和文档兼容未退化。

#### Scenario: China live evidence is incomplete
- **WHEN** 任一中国站必需能力未运行、失败、仅有 mock，或关键协议值仍为假设
- **THEN** 中国站保持不可发布，包版本和 README 不宣称支持；国际站可继续按现有契约发布

#### Scenario: Cross-realm isolation matrix passes
- **WHEN** 两个 realm 使用相同 model ID 并并发执行登录、请求、scope 切换、Usage/UI 操作、logout、取消和 retained model 调用
- **THEN** AuthStorage、credentials、headers/endpoints、目录、设置、异步状态与 transport 均无串扰，且国际站永久回归全部通过
