# 中国站 Realm M2 验收证据

记录时间：2026-09-21

## 1. 结论

**M2 状态：PASS。** `workbuddy-cn` 已通过 account finalize、credential-derived domain restart reconstruction 和官方 OMP 出站 URL/header 三项生产装配前置 gate，因此生产入口可同时装配 `workbuddy` 与 `workbuddy-cn`。本结论不替代 M3 的完整 reasoning/tools/vision/多模型发布矩阵，也不批准中国站 Billing。

## 2. 实现合同

- Provider：`workbuddy-cn`；命令：`/workbuddy-cn`；独立 settings、Widget、scope、catalog、generation、AbortController 与 AuthStorage namespace。
- API origin：`https://copilot.tencent.com`；Chat：`/v2/chat/completions`。
- OAuth start/token/account/refresh 路径来自 M0 冻结证据。
- start 使用 `platform=workbuddy`、body `{}`、无 nonce、1 秒 poll、5 分钟 deadline、pending code `11217`。
- poll token success 后，必须以同一 access token 与验证后的 domain 调用 `/v2/plugin/account`；仅 account `uid` 成为 OMP `accountId`。
- access JWT 仅使用 `iss` claim；要求安全 HTTPS issuer 且 `hostname(iss) === token response domain`。插件不保存 sidecar credential，不挪用宿主无关字段。
- refresh 从持久化 access token 重新构造 domain，要求新 token issuer、新 response domain 与旧 domain 一致。
- Chat 的 `X-Domain` 在 credential validation/projection 时从同一宿主持久化 access token 重建；缺失、非法或身份不匹配时 fail closed。
- 中国站目录仅读取 `~/.workbuddy/cache/acc-product-config-v3.json` 或 `WORKBUDDY_CN_PRODUCT_CONFIG`；缺失、损坏或无有效模型时返回 unavailable/empty，不借用国际站 builtin。
- 每个模型保留 realm-local `creditsRaw` 和 `freeEvidence`：`explicit-zero`、`non-zero`、`unknown`。未知值不进入 free scope。
- 中国站不继承国际站 named-tool-choice transform 或 `deepseek-v4.1-flash` token clamp。
- 中国站 Usage disabled；不注册 UsageProvider，不调用 Billing，管理 UI 显示积分和套餐不可用。

## 3. 脱敏 OAuth、身份与 restart probe

使用官方 OMP `18.2.7`、隔离 profile 和当前源码完成真实中国站登录。只记录字段名、布尔相等性和结果，不记录 token、state、uid、domain 值或完整登录 URL。

| 检查 | 结果 |
|---|---|
| start → poll token | PASS |
| access-token claim key | `iss` 存在 |
| `hostname(jwt.iss) === token-domain` | `true` |
| `/v2/plugin/account` finalize | PASS；durable uid 存在并映射为 `accountId` |
| OMP credential persistence | PASS；保存于隔离 profile 的 `workbuddy-cn` namespace |
| restart 后 headless Chat | PASS；`M2_CN_RESTART_OK` |
| forced refresh | PASS；secret stdout 仅计数字节数，不归档内容 |
| refresh 后 Chat | PASS；`M2_CN_REFRESH_OK` |
| CN logout 后调用 | PASS；明确 `No API key found for workbuddy-cn`，Chat HTTP 为零 |

不安全 issuer（非 HTTPS、userinfo、显式 port、缺失/非法 URL）、response domain 不相等、account uid 缺失和 refresh domain 改变均有永久 fail-closed 回归。

## 4. 官方 OMP 出站复核

临时 probe 仅拦截 OMP 的最终 `fetch` 并输出 URL、method、header 名和非秘密常量比较；随后删除。真实请求成功返回 `M2_CN_OUTBOUND_OK`。

```text
url=https://copilot.tencent.com/v2/chat/completions
method=POST
headerNames=accept,authorization,content-type,user-agent,x-domain,x-no-enterprise-id,x-product,x-requested-with,x-stainless-timeout,x-user-id
authorizationPresent=true
userIdPresent=true
domainPresent=true
x-no-enterprise-id=1
x-product=SaaS
x-requested-with=XMLHttpRequest
originPresent=false
refererPresent=false
```

该记录与 M0 隔离 probe 的 Chat candidate 一致；没有访问国际站 endpoint，没有输出任一 header 的秘密或身份值。

## 5. 双 realm 隔离

同一隔离 OMP profile 同时保存国际站和中国站 credential，并执行：

- 两个 Provider 并发 forced refresh；两者均成功，stdout 仅计数、不记录 credential；
- refresh 后并发 Chat：`M2_DUAL_CN_OK` 与 `M2_DUAL_INTL_OK`；
- `/workbuddy-cn logout` 后国际站仍返回 `M2_CN_LOGOUT_INTL_OK`；
- 中国站随后因 credential 缺失 fail closed；
- permanent regression 验证同 model ID 的 endpoint、metadata、price evidence、scope、token clamp、payload policy 和 retained-model guard 仍按 Provider 分离；
- request hook 只按 `ctx.model.provider` 分派，第三方同 ID payload 保持不变。
- 验收结束后分别执行两个 Provider 的 logout，隔离 profile 不保留 WorkBuddy credential。

当前 OMP `resolveHeaders` 不暴露 Bearer-selected request identity，因此仍保留既定支持边界：活动请求必须完成或取消后再 logout/login 换号；不宣称并发 credential replacement 的原子性。

## 6. 目录与 Usage

真实中国站缓存包含 50 条记录，当前 parser 接受 41 个具有合法 ID 和正整数 input/output budget 的 Chat 候选；其余条目因 schema/budget 不完整不注册。catalog eligibility 不等于 M3 release validation。

永久回归证明：

- missing/invalid CN cache → `unavailable` + 空模型；
- valid empty cache → `empty`；
- Intl missing cache → 独立 `builtin-fallback`；
- same-ID 模型不继承 Intl override；
- `creditsRaw` 原样保留，free 只接受 canonical explicit zero；
- `usage.enabled=false` 时 aggregate Usage/Billing 调用数为零，UI 显示不可用。

## 7. 验证与限制

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS，19/19 串行永久回归脚本 |
| `openspec validate add-workbuddy-cn-realm --strict` | PASS |
| 官方 OMP CN OAuth/account/restart/refresh/Chat/outbound/logout | PASS |
| 官方 OMP 双 realm concurrent refresh/Chat 与 scoped logout | PASS |

M3 仍须完成三代表模型、reasoning、连续/并行 tools、声明的 vision、main/Task/headless 完整矩阵以及最终 README/版本/release evidence 更新。中国站 Billing 仍未验证，必须保持 disabled。
