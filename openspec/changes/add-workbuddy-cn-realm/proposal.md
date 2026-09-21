# Proposal

## Why

现有扩展只支持 WorkBuddy 国际站，Provider、OAuth、模型目录、设置、Usage 和 UI 状态均绑定单一站点。中国站后续开发需要在不破坏已验证国际站行为的前提下增加独立 realm，并先用真实客户端与 Gateway 证据消除协议、缓存和模型能力假设，避免把猜测固化为生产契约。

## What Changes

- 保留 `workbuddy` 国际站契约，新增完全独立的 `workbuddy-cn` Provider、登录命令、认证命名空间、模型目录、scope/settings 和 UI 生命周期；不自动路由、跨站回退或共享凭据。
- 以一个小型不可变 site descriptor 复用确实相同的实现；每个 realm 使用独立运行时闭包。国际站先通过该描述符迁移，并以现有回归证明行为不变。
- 将中国站 origin、Chat/OAuth 端点、Plugin Auth headers、refresh source、轮询状态、响应字段、缓存路径和模型能力视为待验证输入；真实脱敏证据齐备前不注册可发布的中国站 Provider。
- 将 payload 兼容、named tool choice、token clamp 和其他 Gateway workaround 设为 realm 级、证据驱动配置；不得因模型 ID 相同而把国际站修正自动应用到中国站。
- 中国站目录在缓存缺失或无效、且没有已验证 builtin 时返回明确 unavailable/empty 状态；不得回退到国际站目录或把未知模型宣称为免费。
- 在 Billing 协议获得证据前不为中国站注册 UsageProvider；国际站 Usage、Widget 和命令行为保持现有契约。UI key、异步 generation 和清理范围按 Provider 隔离。
- 增加跨 realm 的认证、endpoint/header、目录、设置、Usage/UI、logout、retained model、取消和同模型 ID 隔离验证；共享测试只参数化真正一致的行为，并保留国际站显式回归。
- 以真实中国站 OAuth、Chat、reasoning、tools、vision、main/task/headless 证据和完整国际站回归作为发布门槛；证据未通过前不改变当前安装与发布承诺。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `omp-host-integration`: 从仅国际站扩展为两个显式 realm，并增加中国站协议证据与注册准入门槛。
- `workbuddy-auth-identity`: 将单账号、身份绑定、刷新和 logout 约束限定到各 Provider，并规定跨 realm 凭据隔离。
- `workbuddy-gateway-compatibility`: 将 payload 和模型 workaround 绑定到有证据的 realm，防止同模型 ID 或全局 hook 造成串扰。
- `workbuddy-management-ui`: 增加 Provider 专属命令、UI key、Usage 和异步状态隔离，并定义中国站 Billing 未验证时的行为。
- `workbuddy-model-catalog`: 增加 realm 专属目录、缓存、scope 和预算能力契约，以及中国站无可靠来源时的 unavailable/empty 状态。
- `workbuddy-release-validation`: 增加双 realm 隔离矩阵、中国站真实验证证据和发布准入要求。

## Impact

- 主要影响 `extensions/workbuddy.ts` 与 `src/provider.ts`、`src/workbuddy-api.ts`、`src/models.ts`、`src/settings.ts`、`src/credits.ts`、`src/ui.ts`、payload 兼容层及其测试。
- 新增 `workbuddy-cn` 对外 Provider/登录/命令标识；`workbuddy` 标识和既有国际站用户数据格式保持兼容。
- 需要授权可访问的中国站客户端、OAuth、Gateway、模型目录或缓存样本来完成协议冻结和 live 验收；无法验证时中国站保持不可发布，不以 mock 或国际站假设替代。
- 不引入多账号选择、自动站点探测、跨站 fallback、通用 Provider 框架或第二套认证存储。
