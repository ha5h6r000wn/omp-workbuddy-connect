# 国际站 Realm M1 验收证据

记录时间：2026-09-21

## 1. 结论

**M1 状态：PASS。** 国际站运行时已迁移到不可变 `SiteDescriptor` 和每 realm 独立装配闭包，现有 `workbuddy` 协议与用户行为保持不变。生产入口仍只注册国际站；本文不批准或注册 `workbuddy-cn`。

M2 仍受以下条件约束：

- 中国站 durable uid 必须由已验证的 `/v2/plugin/account` finalize；
- credential-derived domain 必须通过宿主持久语义或经验证的 token claim 在 restart 后恢复；
- 中国站目录必须实施 explicit empty/unavailable fallback 和 Chat eligibility；
- 中国站价格必须使用 realm-bound `creditsRaw` / `freeEvidence`；
- Billing 未获证据批准前，`workbuddy-cn` 不注册 UsageProvider，管理 UI 不触发聚合 Usage 请求。

## 2. 候选与环境

| 项目 | 值 |
|---|---|
| M1 基线 HEAD | `50b5317ce312c54ca19d6a49b06cfc0e1f691026` |
| 扩展包 | `omp-workbuddy-connect@1.1.8-rc.3` |
| 编译契约依赖 | `@oh-my-pi/* 18.2.6` |
| 官方冒烟运行时 | OMP `18.2.7` |
| 操作系统 | macOS Darwin arm64 |
| 真实服务 | WorkBuddy 国际站 |
| 模型 | `workbuddy/hy3` |

M1 基线后的评审加固仍在当前工作树中：optional `orgId` 规范化、disabled Usage/payload no-op、refresh body policy 和单一 Usage provider identity。这些变更通过本文列出的最终本地验证；真实服务冒烟未为这些非国际站行为差异重复登录。

## 3. 实现边界

- `src/site.ts` 定义深度冻结的 `SiteDescriptor` 与 `WORKBUDDY_INTL`。
- descriptor 不持有 credential、session、scope、generation、registry 或 controller。
- OAuth、refresh、Chat headers、模型目录、token override、payload、settings、Usage 和 UI 均显式接收 realm descriptor。
- `deepseek-v4.1-flash` 的 16,384 token 覆盖只属于国际站 descriptor。
- named `tool_choice` 兼容只在对应 realm policy 启用时介入；关闭时 hook 返回 `undefined`。
- `installRealm()` 为每个 realm 创建独立 provider、scope、catalog、model set、transition state、AbortController 和 UI controller。
- 当前入口只调用 `installRealm(pi, WORKBUDDY_INTL)`。

## 4. 永久验证

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | PASS，零错误 |
| `npm test` | PASS，19/19 串行永久回归脚本 |
| `openspec validate add-workbuddy-cn-realm --strict` | PASS |
| Descriptor 深度冻结与无运行状态 | PASS |
| Intl login-start URL/platform/query-body nonce/headers | PASS |
| Poll URL、pending、timeout、cancel、429 与错误分类 | PASS |
| Refresh source、header、无 body 的 Intl policy | PASS |
| CN-like `empty-json` refresh body policy | PASS |
| 同 model ID 的其他 Provider 不继承 Intl token/payload policy | PASS |
| `orgId` 为缺省、空串或空白时统一发送 no-enterprise | PASS |
| `usage.enabled=false` 时 aggregate Usage/Billing 调用数为零 | PASS |
| disabled payload policy 保持 host payload representation 不变 | PASS |
| settings、Usage、Widget、state generation 与迟到结果隔离 | PASS |

## 5. 官方 OMP 国际站真实冒烟

使用隔离 OMP profile 直接加载当前扩展源码；未读取 Desktop credential，未记录任何 secret。

| 场景 | 结果 |
|---|---|
| Fresh OAuth | PASS；官方登录页完成授权并由宿主保存一个 OAuth row |
| Hy3 Chat streaming | PASS；返回 `M1_REALM_OK:omp-workbuddy-connect` |
| 真实 Read tool | PASS；读取 `package.json` 并消费工具结果 |
| 强制 OAuth refresh | PASS；通过官方 `omp token --force-refresh` 路径执行 |
| Refresh 后 Chat | PASS；返回 `M1_REFRESH_OK` |
| Usage Widget | PASS；返回真实积分与套餐，具体账号和数值不归档 |
| Provider logout | PASS；`/workbuddy logout` 成功 |
| 清理检查 | PASS；隔离 profile 的 WorkBuddy OAuth row 数为 0 |

## 6. 脱敏与限制

本文不记录 token、refresh token、Authorization、OAuth state、完整账号标识、组织标识、原始 Billing body 或请求 ID。日志和终端结果只用于确认流程完成。

真实冒烟证明国际站在 descriptor 重构后仍可登录、Chat、refresh、执行工具、查询 Usage 并 logout。它不证明中国站 production readiness，也不解除 M2 的 account finalize、domain restart recovery、目录 eligibility、价格证据和 OMP 出站复核 gate。
