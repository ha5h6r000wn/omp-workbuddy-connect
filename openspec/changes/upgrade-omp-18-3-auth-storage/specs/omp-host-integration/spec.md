# 宿主集成规格增量

## MODIFIED Requirements

### Requirement: HOST-02 Native unmodified host support
扩展 SHALL 使用原生 OMP manifest、包与 Provider/OAuth API，在本候选验收基线 OMP 18.3.0 的未修改官方版本中安装和加载；Provider 标识保持 `workbuddy`、`workbuddy-cn`，各自 Chat 路由与协议保持原有实证值。AuthStorage 调用 SHALL 使用宿主公开的 `oauth`、`credentials`、`usage`、`keys` 命名空间，不依赖已移除的平铺入口或双版本 shim；不要求宿主补丁、跨站代理或自定义 Chat transport。

#### Scenario: Official host loads the extension
- **WHEN** 在 OMP 18.3.0 官方宿主中安装并启动候选扩展
- **THEN** 两个 Provider 可加载，类型检查零错误，且无 extension load error、未知 Provider 字段/事件或模块解析错误

#### Scenario: International-only routing
- **WHEN** 已认证用户通过 `workbuddy` 请求 Chat
- **THEN** 请求经宿主 Provider 到国际站 `/v2/chat/completions`，不访问中国站，也不通过代理绕过宿主

#### Scenario: OMP 18.3.0 加载和已认证请求
- **WHEN** 已锁定 18.3.0 类型和依赖、官方宿主安装候选扩展，并在各 realm 以已有合法凭据请求 Chat
- **THEN** 类型检查无错误、插件加载成功，两个 Provider 分别使用自身的账号查询、身份 Header 和目标 Chat 路由，不因缺失旧平铺方法报错

#### Scenario: 隔离 profile 尚无凭据
- **WHEN** 在隔离的官方 OMP 18.3.0 profile 安装候选而未授权登录
- **THEN** 插件能加载与卸载，但模型可见性和真实 Chat 不得被无凭据的安装结果冒充已验证
