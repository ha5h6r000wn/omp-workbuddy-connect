# Proposal

## Why

当前 Fork 仅完成部分 OMP manifest/import 迁移，仍依赖 Pi-only 事件、双份凭据和旧模型 schema，不能证明在官方 OMP 18.2.6 中认证、身份 Header 与 Agent 调用一致。以 `docs/260919 - OMP WorkBuddy Connect 国际版开发计划 V2.md` 为裁决基线，建立 OMP-native 国际版 Provider，优先证明完整认证不变量，再完成模型、Gateway、管理交互与真实验收。

## What Changes

- 冻结 Fork、OMP 18.2.6、upstream 的精确提交及工作区差异，建立宿主 API/credential 行为证据、两项架构 ADR 和需求到实现/测试矩阵；M0 未通过不得进入 M1。
- **BREAKING**：正式凭据唯一来源改为 OMP AuthStorage；移除自存 `.workbuddy-auth.json`、Desktop、`WORKBUDDY_AUTH_FILE` 的运行时 fallback 与插件自建刷新链。用户通过 `/login workbuddy` 重新登录，不自动导入旧凭据。
- **BREAKING**：仅支持官方 OMP 18.2.6 和 WorkBuddy 国际版；移除 Marker Header、`before_provider_headers`、`model_select`、`refreshModels()`、Pi `thinkingLevelMap` 等旧契约，不兼容 upstream Pi 或较早 OMP。
- 建立 login/refresh/request-boundary 三层身份校验；Bearer 与两个身份 Header 属于同一 durable OAuth credential row/account identity，Bearer 可在同一行内刷新。真实 email 才写入 email，nickname 仅用于展示；检测到多个 stored WorkBuddy OAuth credential 时拒绝模型调用，不轮换、不自动删除。
- 重建 OMP 原生模型能力，明确 Gateway 支持的 thinking/vision/预算；**BREAKING**：unknown 不等于 free，空免费集合不补 fallback，不自动替换被移出 scope 的当前模型。
- 保留 `before_provider_request` 和有服务端证据的最小兼容差异；无证据不得插入 system prompt。Chat 始终复用 `openai-completions`，不增加自定义 transport、parser、全局 fetch 拦截或重试框架。
- 完成 `/workbuddy`、free/all/logout、积分与套餐、model source、非阻塞 Widget、异步结果失效及 OAuth 取消；Headless 认证和调用不依赖 UI。
- 强制 main/subagent/headless、至少三个真实模型、Vision、工具、刷新及安全验收，保存脱敏证据。在线目录与 UsageProvider 是否纳入本版由 M0 ADR 决定，不预先当作必做或固定延期。

## Capabilities

### New Capabilities

- `omp-host-integration`: 精确宿主基线、原生注册/类型、公开 API 行为验证、架构选择与阶段门槛。
- `workbuddy-auth-identity`: 唯一凭据来源、OAuth 生命周期、身份原子性、三层 fail-closed、单账号策略与 logout。
- `workbuddy-model-catalog`: Gateway 驱动的模型能力、目录来源、免费判定、scope 与注册一致性。
- `workbuddy-gateway-compatibility`: 有证据的 payload 差异、Provider 隔离、原生 Streaming 与工具闭环。
- `workbuddy-management-ui`: 管理命令、积分、非敏感设置、生命周期 UI、异步状态隔离与无 UI 行为。
- `workbuddy-release-validation`: main/subagent/headless、四层验证、永久回归、安全、发布矩阵及证据。

### Modified Capabilities

无。`openspec list --specs` 返回空清单；本变更首次建立以上能力规格，均使用 ADDED 增量。

## Impact

- 实现影响 `extensions/workbuddy.ts`、`package.json`、锁文件、`tsconfig.json`、`test/`、README，以及拟按职责提取的 `src/{auth,provider,workbuddy-api,models,payload,credits,settings,ui}.ts`。不修改 OMP 本体、WorkBuddy Desktop 凭据或客户端数据。
- 对外行为变化集中于认证来源、单账号安全约束、模型收费/能力声明和管理命令；OAuth 与 Billing 网络限于功能所需官方国际版 endpoints。
- P1 管理和 Agent 能力属于 v1 发布门槛；真正多账号、Desktop import、增强 Provider 识别、即时模型切换 UI 不在关键路径。动态模型/Usage 仅在 M0 证明适合后走选定分支。
- 本 change 已进入 apply 阶段并已通过 M0 host-contract gate；`tasks.md` 是实施完成状态的唯一权威来源。M1–M5 仍按各自行为与 live evidence gate 推进，不承诺原计划 12–18 日总工期。
