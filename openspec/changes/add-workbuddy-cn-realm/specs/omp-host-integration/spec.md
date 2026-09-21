# Spec Delta

## MODIFIED Requirements

### Requirement: HOST-02 Native unmodified host support
扩展 SHALL 使用原生 OMP manifest、包和 Provider/OAuth API，在未修改的官方 OMP 18.2.6 中安装和加载。国际站 Provider 标识 SHALL 保持 `workbuddy`，Chat base URL SHALL 保持 `https://www.workbuddy.ai/v2`；中国站 Provider 标识 SHALL 为 `workbuddy-cn`，且其 Chat base URL、OAuth 端点和固定协议值 SHALL 仅采用真实中国站证据确认的值。两个 Provider 均不得要求宿主补丁、legacy Pi shim、跨站代理或自定义 Chat transport。

#### Scenario: Official host loads the extension
- **WHEN** 在官方 OMP 18.2.6 安装并启动已通过中国站准入的扩展
- **THEN** 两个 Provider 均可加载，类型检查为零错误，且没有 extension load error、unknown provider field、unknown event 或 module resolution error

#### Scenario: International-only routing
- **WHEN** 已认证用户通过 `workbuddy` 发送 Chat 请求
- **THEN** 请求经宿主 Provider 链路到国际版 `/v2/chat/completions`，不访问中国站或通过代理绕过宿主

#### Scenario: China routing is explicit
- **WHEN** 已认证用户通过 `workbuddy-cn` 发送 Chat 请求
- **THEN** 请求只到证据冻结的中国站官方 Chat endpoint，不访问国际站且不从一个 realm 自动路由到另一个 realm

## ADDED Requirements

### Requirement: HOST-06 China protocol evidence gates registration
中国站 Provider 的 origin、Chat/OAuth endpoint、Plugin Auth headers、refresh source、轮询 pending/status 语义、凭据响应字段、模型来源与缓存路径 SHALL 在生产注册前由授权真实客户端或官方服务的脱敏证据确认。猜测值、国际站类推和 mock MUST NOT 作为生产注册或发布依据。

#### Scenario: China evidence is incomplete
- **WHEN** 任一认证、Chat、目录或缓存关键协议值仍是猜测、未验证或相互矛盾
- **THEN** `workbuddy-cn` 不作为可发布 Provider 注册，国际站仍可独立加载和使用

#### Scenario: China evidence is frozen
- **WHEN** 所有关键协议值均有版本化、脱敏且可复现的真实证据
- **THEN** 实现只使用已确认值注册中国站，并记录证据版本、适用客户端/Gateway 版本和已知限制
