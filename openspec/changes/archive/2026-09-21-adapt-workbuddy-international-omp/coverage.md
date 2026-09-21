# V2 覆盖与一致性核对

## 范围与判定口径

权威输入：`docs/260919 - OMP WorkBuddy Connect 国际版开发计划 V2.md`。本文件记录规划覆盖，不代表 M0 或任何运行验收完成；所有实施任务保持未勾选。原需求补充未被 V2 改变的端点/目录规则，旧计划的 nickname→email、无条件保留补丁、空 free 回退及固定延期 ADR 等做法不再采用。
V2 作为冻结的历史规划输入保留其 `credential generation` 原文。后续宿主实验证明 401 retry 会在不重跑外层 Header resolver 的情况下刷新 Bearer，因此实施语义由 AUTH-04、D3 与 `docs/omp-port/adr-request-identity-binding.md` 收紧为 same durable OAuth credential row/account identity；Bearer MAY 在同一 row 内从 A2 更新为 A3。

本 change 的六个 capability 前缀：HOST=`omp-host-integration`、AUTH=`workbuddy-auth-identity`、MODEL=`workbuddy-model-catalog`、GATE=`workbuddy-gateway-compatibility`、UX=`workbuddy-management-ui`、REL=`workbuddy-release-validation`。完整 requirement 标题及场景在对应 `specs/<capability>/spec.md`；D1–D12 在 `design.md`；数字任务编号在 `tasks.md`。任务范围按包含首尾编号解释。

## 逐节覆盖矩阵

每个编号小节都独立映射；章标题的总体目的通过其子节及下方章节行覆盖，不以关键词出现替代行为落地。

| V2 节 | 必须落地的内容 | 规格 | 设计 | 任务 |
|---|---|---|---|---|
| 1 | 七项目标、OMP 零修改、差异层、身份一致 | HOST-02；AUTH-01/04；GATE-01/06 | Goals；D2/D3/D7 | 1.3；2.2–2.5；4.1/4.6；6.9 |
| 2.1 | Fork repository/实际 branch/exact SHA | HOST-01 | Context；D1 | 1.1 |
| 2.2 | OMP 18.2.6 exact SHA、禁用通配验证 | HOST-01/02 | Context；D1 | 1.1/1.2 |
| 2.3 | upstream 精确提交及修改来源区分 | HOST-01 | Context；D1 | 1.1 |
| 3.1 | AuthStorage 唯一来源，旧凭据不回退 | AUTH-01 | D2/D4 | 2.2；5.1 |
| 3.2 | Bearer/user/enterprise 同一 durable credential row/account identity | AUTH-04/07 | D3 | 2.4/2.8/2.11 |
| 3.3 | 不完整认证不发 Chat | AUTH-05 | D2 | 2.1/2.3/2.5 |
| 3.4 | 模型 metadata 决定协议 | MODEL-01–04 | D5 | 3.1–3.4 |
| 3.5 | 宿主标准、插件差异、禁止重复基础设施 | HOST-02；GATE-06 | Non-Goals；D11 | 1.3；4.6；6.7 |
| 4.1 | M0 宿主契约/编译/加载/证据 | HOST-03/05 | D1 | 1.1–1.10 |
| 4.2 | 全部 OMP-facing API matrix | HOST-03/04 | D1 API 表 | 1.3–1.8 |
| 4.3 | 修 syntax/字段/事件/import/manifest | HOST-02 | Context；D1 | 1.2/1.3 |
| 4.4 | 真实 AuthStorage login/persist/refresh/delete/restart 和重复登录语义 | HOST-03 | D1/D3 | 1.4 |
| 4.5 | modifier 六项行为及非目标永久隔离 | HOST-03；AUTH-06 | D1/D3 | 1.5；2.4 |
| 4.6 | 调查稳定在线模型 API，M0 ADR 非强制实现 | HOST-04；MODEL-06 | D6 | 1.7；3.6 |
| 4.7 | Usage 表达和 identity 评估，不建第二刷新器 | HOST-04；UX-03 | D8 | 1.8；5.1 |
| 4.8 | 六项 M0 交付，含两 ADR、映射矩阵 | HOST-05 | D1 指定文件 | 1.1/1.3/1.4/1.7–1.10 |
| 4.9 | M0 全部 exit gate 后才 M1 | HOST-05 | D1；Migration | 1.10 |
| 5.1 | 一个模型完整认证闭环 | HOST-05；AUTH-01–09 | D2–D4；Migration | 2.11 |
| 5.2 | OAuth schema 完整映射 | AUTH-02 | D2 | 2.1 |
| 5.3 | nickname 不进 email；真实 email 才保留 | AUTH-02 | D2 | 2.1 |
| 5.4 | login 五类必要字段校验、禁止部分成功 | AUTH-02/05 | D2 | 2.1/2.2 |
| 5.5 | refresh 仅输入宿主 credential、保留身份 | AUTH-03/05 | D2 | 2.3 |
| 5.6 | getApiKey 提供 access、宿主 Bearer | AUTH-04/05 | D2/D4 | 2.5 |
| 5.7 | 固定国际版 Headers 和 modifier 身份注入 | AUTH-04 | D3 | 2.4 |
| 5.8 | 只改 WorkBuddy；OpenAI/Anthropic 不变 | AUTH-06 | D3 | 2.4 |
| 5.9 | login/refresh/API key 三层 fail-closed | AUTH-05 | D2 | 2.1/2.3/2.5 |
| 5.10 | 多账号可检测则拒绝；无法检测仍验 A→B/旧会话/subagent | AUTH-07 | D3 | 1.4/1.5；2.6/2.8/2.11 |
| 5.11 | 旧 credential 主链彻底切断 | AUTH-01 | D2/D11 | 2.2；6.7 |
| 5.12 | 删 OMP credential、失效 UI/provider、不动 Desktop | AUTH-08；UX-02/04 | D4 | 2.7；5.5 |
| 5.13 | 真实账号 M1 exit gate | HOST-05；AUTH-01–09 | Migration | 2.11 |
| 6.1 | Gateway 实际能力一致 | MODEL-01–04 | D5 | 3.1–3.4；3.10 |
| 6.2 | buildOmpModels、真实类型、完整 resolved model | MODEL-01 | D5；Clarifications | 3.1 |
| 6.3 | canonical thinking、支持 efforts、required/off | MODEL-02 | D5 | 3.2 |
| 6.4 | reasoning_effort 由宿主生成 | MODEL-02；GATE-02 | D5/D7 | 3.2；4.2 |
| 6.5 | Vision 声明、stripImageInput、真实图片 | MODEL-03 | D5 | 3.3 |
| 6.6 | 目录/请求预算一致、证据支持 clamp | MODEL-04；GATE-01 | D5/D7 | 3.4；4.1 |
| 6.7 | unknown 非 free，empty 不补 fallback | MODEL-05 | D5 | 3.5 |
| 6.8 | cost 零占位不是免费证明 | MODEL-05 | D5 | 3.5；6.8 |
| 6.9 | ADR A/B 路径与 remote/cache/builtin 来源 | MODEL-06 | D6 | 1.7；3.6 |
| 6.10 | scope 六状态同步、不可改 credential | MODEL-07；UX-02 | D9 | 3.7/3.9；5.3 |
| 6.11 | 当前模型移出范围要提示，不自动选替代 | MODEL-07 | D9 | 3.8 |
| 6.12 | 三模型/能力/free-empty/restart/credential M2 gate | MODEL-01–07 | D5/D9 | 3.10 |
| 7.1 | 从 OMP 原生 payload 出发 | GATE-01/02/06 | D7 | 4.1/4.2 |
| 7.2 | 每个 transform 有删除后失败 case | GATE-01 | D7 | 4.1 |
| 7.3 | 四类补丁仅作为保留候选 | GATE-01/04 | D7 | 4.1/4.4 |
| 7.4 | 去除宿主已实现标准转换/解析 | GATE-02/06 | D7 | 4.2/4.6 |
| 7.5 | 没证据不插入 system prompt | GATE-02 | D7 | 4.2 |
| 7.6 | before_provider_request request-bound Provider 识别；scope guard 位于 resolver | GATE-03 | D7 | 4.3 |
| 7.7 | 当前/历史同 ID 非目标 payload 完全不变永久回归 | GATE-03；REL-03 | D7/D12 | 4.3 |
| 7.8 | 单/连续/多工具/支持时 parallel/arguments/auto/named/关联 | GATE-04/05 | D7 | 4.4/4.5 |
| 7.9 | deltas/usage/DONE/HTTP Error/Abort/Retry，原生 transport | GATE-06 | D7 | 4.6 |
| 7.10 | 完整 Gateway/tools/error/isolation gate | GATE-01–06 | D7/D12 | 4.7 |
| 8.1 | UI/Billing 非关键面不能阻塞 Chat | UX-03 | D8/D9 | 5.2/5.4 |
| 8.2 | 状态八项 + unavailable 非零 | UX-01 | D8 | 5.2/5.3 |
| 8.3 | free 重建/ID/注册/持久化/UI | UX-02；MODEL-07 | D9 | 3.7；5.3 |
| 8.4 | all 是当前可识别集合 | UX-02；MODEL-05 | D5/D9 | 3.5/3.7；5.3 |
| 8.5 | logout 明确操作顺序 | AUTH-08；UX-02/04 | D4 | 2.7；5.3/5.5 |
| 8.6 | Credits 使用 OMP 凭据、失败不影响 Chat | UX-03 | D4/D8 | 5.1/5.2 |
| 8.7 | 四类事件失效 generation，迟到结果不回写 | UX-04 | D9 | 5.5 |
| 8.8 | 三类取消、六类错误、polling Retry-After、one-shot 429 | AUTH-09 | D10 | 2.9/2.10 |
| 8.9 | command-scoped UI；session/turn 清理且 zero Billing；迟到结果不重绘 | UX-05 | D9 | 5.4 |
| 8.10 | 无 UI 不影响 auth/model/payload/transport | UX-06；REL-01 | D9/D11 | 1.6；5.6；6.2 |
| 8.11 | commands/credits/slow/stale/restart/headless M4 gate | UX-01–07 | D8–D10 | 5.7 |
| 9.1 | Main chat/thinking/tool/streaming/refresh | REL-01 | D12 | 6.1 |
| 9.2 | task role/subagent 身份/hook/stream/tools/result | REL-01 | D3/D12 | 6.2 |
| 9.3 | Headless 五项真实调用能力 | REL-01；UX-06 | D9/D12 | 6.2 |
| 9.4 | 秘密不入日志/项目、identity 脱敏 | REL-04 | D10/D12 | 6.5 |
| 10 | 全部 Release Matrix 案例 | REL-02 | D12 | 6.4；下表逐例映射 |
| 11 | 十一类 Release Evidence 字段 | REL-05 | D12 | 6.6 |
| 12.1 | Unit 六类纯行为 | REL-03 | D12 | 2.1/2.3；3.1/3.2/3.5；4.4；6.3 |
| 12.2 | 真实类型/API Contract | REL-03 | D1/D12 | 1.2/1.3；2.4/2.5；4.3；6.3 |
| 12.3 | 真实 OMP Integration 六类 | REL-03 | D12 | 1.4/1.5；2.7；3.7；6.2/6.3 |
| 12.4 | Live OAuth/Chat/Refresh/Vision/Tools/Credits | REL-02/03 | D12 | 2.11；3.3/3.10；4.5；5.1；6.3/6.4 |
| 13 | 十二类永久回归 | REL-03 | D12 | 6.3；下表逐项映射 |
| 14 | 入口 + 八模块职责、HTTP 不依赖 UI、settings 不存秘密 | AUTH-01；UX-06/07；HOST-02 | D11 | 2.1；3.1/3.9；4.2；5.1/5.4；6.7 |
| 15 | 禁止五类提前抽象 | HOST-02；GATE-06 | Non-Goals；D11 | 6.7 |
| 16 | M0→M5；M1 串行，M2/3 固定三契约后局部并行 | HOST-05 | Migration | 各阶段 gate 1.10/2.11/3.10/4.7/5.7/6.9 |
| 17 | 六阶段各自完成定义 | HOST-05；REL-02 | D1/D12；Migration | 各阶段 gate，同上 |
| 18 | M0 1–2 日，之后重估，不承诺总期 | HOST-05 | Migration | 1.10 |
| 19 | 全部 v1 Release Definition | REL-02；HOST-05 | D12 | 6.9 |
| 20 | 单账号不接受错配、UI 延迟、request-bound Provider 隔离、缓存来源 | AUTH-07；UX-05；GATE-03；MODEL-06；REL-06 | Risks | 2.6；4.3；5.7；6.8 |
| 21 | v1.1 候选不入关键路径；动态/Usage 由 M0 决定 | HOST-04；REL-06 | Non-Goals；D6/D8 | 1.7/1.8；3.6/5.1；6.8 |
| 22 | 十条长期原则 | HOST-02；AUTH-01/04/05；MODEL-01/05；UX-03；GATE-01/06；REL-03 | Goals/Non-Goals；D2–D12 | 2.2/2.5/2.8；3.5；4.1/4.6；5.2；6.3/6.9 |
| 23 | 首个交付须一个真实模型完整认证及换号链 | HOST-05；AUTH-01–09 | Migration | 2.11 |

## Release Matrix 逐例映射

以下每项在 REL-02 和任务 6.4 统一核签；本表列提前取得对应证据的具体入口。所有状态均为“已规划，尚未运行”，不是 PASS。

| V2 §10 Case | Requirement / 场景方向 | 任务 |
|---|---|---|
| Install 正式加载 | HOST-02 Official host loads | 1.3 |
| Type 零错误 | HOST-01/02 锁版本编译 | 1.2 |
| Fresh OAuth | AUTH-02 Complete login | 2.2/2.11 |
| First request identity | AUTH-04 First authenticated request | 2.4/2.11 |
| Restart recovery | AUTH-01 Restart | 2.11 |
| Expired access | AUTH-03 Forced expiry | 2.3/2.11 |
| Invalid refresh | AUTH-03 Invalid refresh | 2.3 |
| Missing accountId | AUTH-05 Stored credential lacks accountId | 2.5 |
| Optional orgId / no-enterprise | AUTH-05 Optional orgId uses explicit no-enterprise Chat semantics | 2.5 |
| Account A→B | AUTH-07 Sequential switch | 2.8/2.11 |
| Logout truly invalid | AUTH-08 Logout | 2.7/2.11 |
| ≥3 real models | MODEL-01；REL-02 | 3.10 |
| Supported thinking | MODEL-02 required/off/efforts | 3.2/3.10 |
| Real image | MODEL-03 Vision | 3.3 |
| read/grep/bash | GATE-05；REL-02 | 4.5/6.4 |
| Sequential/multi tools | GATE-05 Tool loop | 4.5 |
| Main agent | REL-01 Main | 6.1 |
| Subagent/role | REL-01 Task role | 6.2 |
| Headless | REL-01；UX-06 | 5.6/6.2 |
| Scope free | MODEL-05/07；UX-02 | 3.5/3.7 |
| Scope all | MODEL-05/07；UX-02 | 3.7 |
| Empty free | MODEL-05/07 Empty/restart | 3.5/3.9 |
| Billing success | UX-01/03 | 5.1/5.3 |
| Billing 5xx | UX-01/03 | 5.2 |
| Billing timeout/slow | UX-03 | 5.2/5.4 |
| Other provider unchanged | AUTH-06；GATE-03 | 2.4/4.3 |
| No credential leakage | REL-04 | 6.5 |

## 永久回归逐项映射

| V2 §13 回归 | 规格 | 保留/迁移任务 |
|---|---|---|
| Refresh 保留身份 | AUTH-03 | 2.3 |
| Missing account identity 零请求；optional orgId 显式 no-enterprise | AUTH-05 | 2.5 |
| modifier 非目标不变 | AUTH-06 | 2.4 |
| payload 非目标及当前/历史同 ID Provider 不变 | GATE-03 | 4.3（scope + ExtensionRunner contract） |
| A logout+B login 无 A 身份 | AUTH-07 | 2.8 |
| reasoning 清理不破坏工具消息 | GATE-04 | 4.4 |
| free 不含已知付费 | MODEL-05 | 3.5 |
| unknown 不算 free | MODEL-05 | 3.5 |
| Billing 慢不影响启动/Chat | UX-03 | 5.4（现有 session-start 测试） |
| logout 丢弃迟到积分 | UX-04 | 5.5 |
| Provider 重注册不改 credential | MODEL-07 | 3.7 |
| Headless 无 UI 依赖 | UX-06 | 5.6 |

## 已处理的易错点与边界

1. **昵称语义**：AUTH-02、D2、2.1 明确 nickname 不写 email；只有官方真实 email 才持久化该身份字段。
2. **三层拒绝不等于原子性证明**：AUTH-04/05 分开；D3 承认宿主 Token/模型投影时点差异，任务 1.5/2.8 需要旧引用及真实换号证据；无法满足安全不变量即阻断。
3. **保留候选不是必留补丁**：GATE-01/02、4.1/4.2 要求失败 case；自动 system prompt 无证据删除。
4. **目录 fallback 与免费 fallback 区分**：MODEL-05/06 允许缓存失效时有来源标记的内置目录，不允许有效目录空 free 被补足；未知价格始终非 free。
5. **注册对象与 resolved Model 区分**：MODEL-01、D5 将完整字段语义放最终模型，buildOmpModels 输出以真实 ProviderModelConfig 为准，避免引入非法 provider/baseUrl 字段。
6. **隔离分层**：modifier 对所有非 WorkBuddy 不变；payload hook 使用 request-bound `ctx.model.provider`，当前与历史同 ID 的其他 Provider 也不变；活动 scope/切换期 fail-closed 由 WorkBuddy `resolveHeaders` 承担。
7. **ADR 不被偷换成延期或必做**：1.7/1.8 有选择证据，3.6/5.1 有选定路径实施及验收，未选路径无空壳实现。
8. **M0 不被规划检查冒充完成**：已记录精确提交但尚有工作区差异、宿主实验待运行；coverage.md 不是六项 M0 交付中的运行证明。
9. **工期与版本不混用**：M0 后重估；功能 v1 不把 manifest 1.1.7 自动降级。
10. **必需内容不被 P1 隐藏**：管理命令、Credits、main/subagent/headless、声明 Vision 均在发布矩阵，不作为可裁剪后续项。

## 尚需执行的证据，不是规划遗漏

- M0：宿主重复登录语义、公开删除/认证/取消路径、modifier 生命周期、旧引用/subagent，以及两个 ADR 的实测选择。
- M1–M5：真实账号 A/B、至少三个真实模型、图片、工具、积分、各类故障及发布安全证据。
- 只有开始 apply 后才填运行结果；本轮不安装依赖、不改代码、不触碰账号凭据、不启动 apply。

## 本轮核对结果

- 逐节核对：V2 的 23 章、85 个末级编号节全部有映射，无未映射小节；Release Matrix 的 27 个案例和十二类永久回归均单列对应。
- 产物结构：六个 capability 与 proposal 路径完全一致；40 项 requirement 均有规范性约束及场景，共 76 个 WHEN/THEN 场景。
- 可执行任务：54 项任务全部未勾选；每项 requirement 均有任务引用，覆盖表中的任务目标均存在，无未知 requirement 引用。
- 独立语义复核：认证/模型/Gateway（V2 §§1–7）和管理/发布（§§8–23）分别完成只读复核，未发现具体遗漏、冲突或把宿主待验证行为写成已保证的情形。
- OpenSpec 严格校验：`openspec validate adapt-workbuddy-international-omp --strict --json` 返回 `valid: true`、`issues: []`，一项通过、零项失败。
- 结论：规划覆盖完整，未发现尚未处理的文档遗漏或错误。该结论仅针对规划一致性；真实宿主行为、ADR 选择及 Live E2E 仍是后续实施门槛，不视为已完成。
