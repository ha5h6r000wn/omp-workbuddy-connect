# 双 Realm M3 验收证据

记录时间：2026-09-21

> 本文 PASS 只适用于 2026-09-21 的 OMP 18.2.7 / `v1.2.0-rc.1`。OMP 18.3.0 / `v1.2.0-rc.3` 候选的部分验证与未完成发布门槛见 [`../upgrade-omp-18-3-auth-storage/evidence.md`](../upgrade-omp-18-3-auth-storage/evidence.md)，不可沿用本文批准结论。

## 1. 结论

**M3 functional matrix：PASS。M3 RC publication gate：PASS with documented host limitation。Stable publication：pending RC observation / final review。** `workbuddy` 与 `workbuddy-cn` 的 OAuth、重启、刷新、Chat、scope、并发、取消、main/Task/headless、工具和 vision 均通过。官方 OMP `18.2.7` 的自动 HTTP 400/413 request dump 会移除 Authorization/Token 等认证秘密，但仍可能把动态 `X-User-Id` 原值写入本地诊断附件；该文件不由扩展上传，且未观察到跨 realm 数据。此项按已披露的 host-local privacy limitation 接受用于 RC，不表述为完全脱敏。

本轮批准发布 `1.2.0-rc.1`，README 同步公开双 realm 支持、独立登录/scope、CN Billing disabled、串行换号边界与宿主本地诊断限制。Stable 仍等待 RC 观察和最终评审。

## 2. 可复现基线

| 字段 | 值 |
|---|---|
| OMP | `18.2.7`，本轮开始和结束时均为 npm 最新稳定版 |
| `@oh-my-pi/*` 开发/peer 依赖 | 精确锁定 `18.2.7` |
| 扩展版本 | `1.2.0-rc.1` |
| 验收基线提交 | `c70755b126164f174190272be5e650f939777627` 加本轮工作区修改 |
| Node / Bun / npm | `v26.9.0` / `1.4.2` / `11.19.1` |
| 主机 | macOS Darwin arm64 |
| 隔离 profile | `workbuddy-m3-live`；验收后两个 realm 均 logout，并删除 profile |
| 国际站账号 | 个人账号；身份脱敏 |
| 中国站账号 | 个人账号、无 enterprise identity；身份脱敏 |
| 国际站模型 | `hy3`、`hy4-preview-f`、`deepseek-v4.1-flash` |
| 中国站模型 | `hy3`、`glm-5.3`、`deepseek-v4.1-flash` |
| 客户端协议标识 | `CLI/2.63.2 CodeBuddy/2.63.2` |

## 3. 永久回归

新增 `test/contract/dual-realm-isolation.test.mts`，在真实 OMP `AuthStorage`、`ModelRegistry` 和生产 extension composition 上同时装配两个 realm，并验证：

- 双 AuthStorage namespace、相同 model ID 和独立 endpoint；
- 国际站 `deepseek-v4.1-flash` 16,384 token clamp 不进入中国站；
- 国际站固定 Origin/domain Header 来自 ProviderConfig，中国站固定配置不复制这些 Header；两个 realm 的 credential-derived identity/domain Header 不串扰；
- named `tool_choice` transform 仅进入国际站，第三方同 ID 保持不变；
- 两份 scope/settings 分别持久化；
- 中国站 Usage disabled 且 UI 显示不可用，国际站 Billing 仅调用国际站 endpoint；
- 中国站 logout 不删除国际站 credential，retained CN model fail closed，国际站 retained model 继续工作；
- shutdown 失效 retained transport，Desktop-owned fixture 不变；
- finally 关闭数据库、注销两个 OAuth Provider 并删除临时目录。

本轮完整 runner 报告 20 个永久脚本；OAuth 拒绝、poll timeout、429/Retry-After、取消、同 ID dispatch、CN unclamped budget 和资源释放继续由既有确定性脚本覆盖。

## 4. 官方 OMP 双 Realm Integration Matrix

| 场景 | 结果 | 脱敏执行证据 |
|---|---|---|
| Fresh OAuth | PASS | 同一隔离 profile 分别执行 `/login workbuddy-cn` 与 `/login workbuddy`；两次均由官方页面完成并保存到各自 namespace |
| Restart | PASS | 停止登录 TUI 后重启官方 OMP；两个 realm 的模型均从持久化 credential 恢复 |
| Scope | PASS | 重启后分别执行 `/workbuddy-cn all`、`/workbuddy all`，宿主均确认切换；两个 settings 文件保持独立 |
| Forced refresh | PASS | 通过临时 extension 使用公开 AuthStorage 把目标 realm expiry 设为过去；下一次真实 Chat 分别返回 `M3_CN_REFRESH_OK`、`M3_INTL_REFRESH_OK` |
| Concurrent requests | PASS | 两个官方 headless 进程同时返回 `M3_DUAL_CN_OK` 与 `M3_DUAL_INTL_OK` |
| Cancellation | PASS | 活动 CN reasoning 请求开始 transport 后收到 Ctrl-C，进程以 130 退出；后续 CN/Intl 请求继续成功 |
| Interactive main | PASS | 两个 realm 的真实 TUI turn 分别返回唯一 marker |
| Headless | PASS | 两个 realm 的 `omp -p` 均完成 OAuth resolution、streaming 和 clean exit |
| Task | PASS | CN main 与 fresh headless Task 实例均观察到 `workbuddy-cn/hy3`。Intl main 使用 `workbuddy/hy3`；fresh Task 实例实际观察为 `workbuddy/gemini-3.5-flash`，重试 fallback 为 `workbuddy/glm-5.3-flash`。这证明真实 Intl Task runtime 与 provider 隔离，但不宣称临时 `modelRoles.task=workbuddy/hy3` 强制了具体 Task 模型；REL-07 只要求真实 Task 执行，不要求固定模型 ID |
| Same-ID/foreign isolation | PASS | 永久 runtime regression 证明 hook 以 `ctx.model.provider` 分派，第三方同 ID payload 原样保留 |
| Scoped logout | PASS | `/workbuddy-cn logout` 后 CN 在 HTTP 前返回 `No API key found`，Intl 同时返回 `M3_CN_LOGOUT_INTL_OK`；最终 Intl 也 logout |
| Account replacement boundary | PASS（声明边界） | OMP `resolveHeaders` 仍无 request-attempt identity；仅支持先完成/取消活动请求，再 logout/login，不宣称并发换号原子性 |

拒绝、timeout、429 和 Retry-After 使用生产 OAuth helper 的确定性 HTTP 回归复核；本轮未人为攻击真实官方 OAuth 服务来制造错误。

## 5. 中国站真实能力矩阵

| 场景 | 结果 | 证据 |
|---|---|---|
| Hy3 Chat | PASS | `M3_CN_HY3_OK` |
| GLM-5.3 Chat | PASS | `M3_CN_GLM53_OK` |
| Deepseek-V4.1-Flash Chat | PASS | `M3_CN_DEEPSEEK41_OK` |
| 第四候选 MiniMax-M2.5 | NOT COUNTED | 官方 Gateway 返回 400 / code 11102 `service info not found`；目录 eligibility 不等于账号实时可用性 |
| Reasoning / low budget | PASS | 临时 request hook 只把 Hy3 `max_tokens` 设为 1；真实 assistant `stopReason=length`、文本长度 0、thinking 长度 2 |
| Reasoning / sufficient budget | PASS | Hy3 high effort `stopReason=stop`、文本长度 24、thinking 长度 215，返回 `M3_REASONING_COMPLETE_OK` |
| 单工具 | PASS | 真实 read 后返回 `M3_CN_SINGLE_TOOL_OK:omp-workbuddy-connect` |
| 连续工具 | PASS | read 结果后再 grep，返回 `M3_CN_SEQUENTIAL_TOOLS_OK` |
| 多工具 | PASS | 同一 turn 请求两个独立 read，返回 `M3_CN_MULTI_TOOL_OK` |
| Vision | PASS | Hy3 读取真实 2×2 红色 PNG，返回 `M3_CN_VISION_OK:red` |
| Usage/UI | PASS | `/workbuddy-cn` 显示积分、套餐不可用；未注册 UsageProvider，未调用 Billing |

三个计入模型均来自本轮真实中国站缓存，并声明 reasoning、tools 和 image 能力。MiniMax 失败被如实保留，不用于凑足“三模型”要求。

## 6. 国际站完整回归

- `hy3`、`hy4-preview-f`、`deepseek-v4.1-flash` 均完成真实 Chat；Hy3 high effort 完成 reasoning。
- Hy4 对真实 2×2 红色 PNG 返回 `M3_INTL_VISION_OK:red`。
- read → grep → bash 真实工具链返回 `M3_INTL_TOOLS_OK`。
- main、真实 Task runtime、headless、restart、forced refresh、all scope、并发和 scoped logout 均通过；Intl Task 的实际模型为 `gemini-3.5-flash`，重试 fallback 为 `glm-5.3-flash`，未将其误记为 Hy3。
- `/workbuddy` 从官方 Billing 获得非零积分并把 Provider 显示为已就绪；具体额度和账号信息不归档。

## 7. 安全、文件、网络与诊断审查

### 通过项

- 生产源码只声明 `https://www.workbuddy.ai`、`https://copilot.tencent.com` 和允许的中国站登录 origin；没有 loopback proxy、全局 fetch interception、自定义 Chat transport 或第三方上传。
- 项目目录扫描未发现 `.env`、auth DB、credential、token 或 runtime log artifact。
- M3 profile 日志未匹配 Authorization Bearer、refresh/access token 或 `X-Refresh-Token` 值。
- 国际站和中国站 Desktop model cache SHA-256 在 M0 与 M3 一致：
  - Intl `f8805736077d73549ef88f6615b7e246a6548b311f1b526c0c673ea020e89027`
  - CN `fc0782468bcb777781c5f37814be44ff8413545845acbdb025dd7eb1a9fe8245`
- 中国站 400 dump 的 URL 仅为 `https://copilot.tencent.com/v2/chat/completions`；Authorization 已由宿主移除，没有 Token、Authorization 或 pending OAuth code。

### 已披露的宿主本地隐私限制

对 MiniMax 不可用响应，OMP `18.2.7` 自动生成的 `http-400-requests/*.json` 包含动态 `X-User-Id` 原值。宿主的 `http-inspector.ts` 仅按 header 名中的 `key|token|secret|auth|credential|cookie` 脱敏，因此不会处理 `X-User-Id`。该附件只位于隔离 profile，已随 profile 清理且未进入仓库；Authorization、access/refresh token、API key、credential、pending code、跨 realm identity 或第三方上传均未出现。

RC 风险接受：该现象属于官方宿主在本机保留账号标识，不是认证秘密泄漏。扩展不修改宿主、不移除官方协议要求的 identity Header，也不增加扫描宿主日志的副作用。README 明确文件位置、风险和手动处理方式；下一次最新稳定版 OMP 验收时继续复核。

## 8. 发布决策

- 官方 local install 与 uninstall：PASS；`plugin doctor` 中 `omp-workbuddy-connect` 为 `ok`，新隔离 profile 同时报 `package_manifest: Not created yet` 非阻塞 warning；发布准备版本 `1.2.0-rc.1`。
- 中国站功能 gate：PASS。
- 国际站回归 gate：PASS。
- Credential/secret privacy 与跨 realm 隔离：PASS。
- Host-local `X-User-Id` diagnostic persistence：KNOWN LIMITATION，已披露并接受用于 RC。
- M3 RC publication：**PASS**。
- Stable publication：等待 RC 观察与最终评审。
