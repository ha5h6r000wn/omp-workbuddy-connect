# OMP 18.3.0 兼容性验收增补

记录日期：2026-09-24。候选版本：`omp-workbuddy-connect@1.2.0-rc.3`（工作区源码，未发布 tag）。官方命令行版本：`omp/18.3.0`；`@oh-my-pi/pi-ai`、`pi-coding-agent`、`pi-agent-core`、`omptype` 精确锁定 18.3.0。历史 18.2.7 M3 结论见 [`m3-evidence.md`](../add-workbuddy-cn-realm/m3-evidence.md)，本增补不改变其适用范围。

## 宿主接口变更与实现边界

OMP 18.3.0 以 `AuthStorage.oauth.accounts(provider, sessionId?)`、`credentials.remove(provider)`、`usage.invalidate(provider, signal?)`、`usage.reports({ signal })`、`keys.resolver(provider, options?)` 替代旧平铺方法。Provider 查询全部 stored rows 时不传 session ID，UI 查询当前会话账号时传入 session ID；测试凭据和宿主 resolver 同步迁移。生产变更位于 `src/provider.ts`、`src/ui.ts`，未修改 WorkBuddy OAuth/Gateway/Billing 服务协议。

18.3.0 的 `Model.resolveHeaders(signal?)` 类型及 `streamSimple` 调用仍不向 Header 回调传入本次请求选中的 credential 或 session。新增的 `keys.getWithCredential` 虽可返回行号，但 Header 回调单独调用它不能证明得到的是该 transport attempt 使用的 Bearer。AUTH-04 并发换号边界仍在；不能把 18.2.7 的证据解释为 18.3.0 已提供原子身份绑定。

在独立临时 SQLite 目录中通过真实 `AuthStorage.create()` 验证了 `credentials.set/get/remove`、`oauth.accounts(provider)`、带 session ID 的 `oauth.accounts`、`sessions.pin`、`keys.resolver`、`usage.invalidate/reports`。观察到一行账号；只有被 pin 的 session 显示 `active=true`；Usage 返回报告数组；删除后账号为零行。测试后关闭并删除临时存储，未访问用户 profile 或真实凭据。

## 已观察的检查

| 检查 | 实际结果 | 证据边界 |
|---|---|---|
| `npm test`、`npm run test:fast` | 两种运行器均 20/20 永久脚本通过 | 使用真实 18.3.0 AuthStorage/ModelRegistry 与确定性 transport/Task fixture；不等于真实 Gateway 发布矩阵 |
| `npm run typecheck`、`npx openspec validate upgrade-omp-18-3-auth-storage --strict`、`npx openspec validate add-workbuddy-cn-realm --strict`、`npm pack --dry-run` | 隔离验收后全部通过；pack 列出 13 个文件 | 包与契约门槛，不证明账号授权 |
| 初次官方 CLI 隔离 profile：`plugin install .`、`plugin doctor`、`models workbuddy --json`、`plugin uninstall` | 安装、卸载成功；doctor 中插件为 `ok`；无凭据时模型列表为空；新 profile 的 `package_manifest` 为“Not created yet”警告 | 该次 profile 未执行 OAuth；后续 fresh OAuth 见下节 |
| 使用现有登录态、关闭默认扩展发现并显式加载当前源码（`--no-extensions -e ./extensions/workbuddy.ts`），分别对 `workbuddy/hy3` 和 `workbuddy-cn/hy3` 执行 `-p --no-session --no-tools` | 分别返回 `WB183_INTL_OK`、`WB183_CN_OK` | 非 fresh OAuth、重启或强制刷新 |
| 国际站 headless Read 提示 | 返回 `WB183_TOOL_VERSION=1.2.0-rc.3` | 仅凭答案不能独立证明工具调用 |
| 中国站 headless Read 的 JSON 事件 | 观察到 `read` start/end；读取 `package.json` 后 assistant 返回精确值 `CN_PACKAGE_VERSION=1.2.0-rc.3` | 现有登录态下的只读工具路径，不是 fresh OAuth |
| 官方交互式 TUI 加载当前源码后执行 `/workbuddy`、`/workbuddy-cn` | 国际站显示“积分可用”，中国站显示“积分不可用” | 本次未实测中国站 Billing 网络请求数；确定性双站契约覆盖零请求 |
| 国际站模型下的 headless `task` 请求 | 观察到 `task` start/end 和最终回答标记 | 未独立记录子进程实际模型、realm 和认证身份；不能计入真实 WorkBuddy Task E2E |
| 首次双站并发 headless 探针 | 两个进程超过 110 秒观察期限后被停止 | 当时未保留阶段事件；原因仍未知，不可写成通过 |
| 后续带时间戳的双站并发 Chat | `workbuddy/hy3` 与 `workbuddy-cn/hy3` 同时启动、均 exit 0 并返回各自预期标记；首个 `message_update` 分别在约 3.1 秒、1.5 秒，进程分别在约 12.8 秒、10.8 秒退出 | 证明本次并发请求可完成；不能反推首次超时的原因或排除偶发问题 |
| 18.3.0 本地 HTTP 诊断源码检查 | `@oh-my-pi/pi-ai/src/utils/http-inspector.ts` 的敏感 Header 正则仍为 `/key|token|secret|auth|credential|cookie/i`，不匹配 `X-User-Id` | 旧版已观察的本地账号标识风险仍需告知；本次未制造 HTTP 400/413 或审计新的真实 dump |

带时间戳的并发探针还观察到两个 `agent_start` 均在约 0.38 秒、`agent_end` 分别在约 3.1/2.0 秒、`advisor_yielded` 在约 12.7/10.7 秒。**本次** transport/模型回复与 agent 结束均未卡在账号选择或 SQLite；进程结束前还经历了宿主后续阶段。但首次 110 秒超时未记录同类事件，无法判定当时卡在 auth、HTTP、Gateway 或宿主退出阶段，需保留为未定位的偶发失败。

此前使用现有用户 profile 的非破坏性检查未记录原始账号标识、Token、Authorization、请求体或 OAuth state；仅用于 Chat、只读工具、Task 调用及管理界面观察，未执行 logout、覆盖凭据、scope 切换或强制过期。当时的 Intl Task 子进程 Provider/模型/身份未确认，不据此声称完整的无副作用证明；后续隔离 profile 的 CN Task 元数据见下节，仍不证明 Bearer 与 Header 的原子身份绑定。

## OMP 18.3.0 隔离 profile 定向真实验收

2026-09-24 在 Darwin arm64、官方 `omp/18.3.0`、Node `v26.9.0`、Bun `1.4.2` 上验收未发布 `1.2.0-rc.3`，源码基线 `b5eb7666eaf11cc2d558711b9ec7fb2e7bec4f59`。专用 profile `wb-183-rc3-live-0924` 与默认 profile 隔离；安装当前源码的插件后 doctor 显示插件 `ok`，新 profile 的 `package_manifest` 仍有“Not created yet”警告。以下只记脱敏的退出状态、模型/realm、行数、过期时间方向、阶段事件与自定义标记。

| 受影响路径 | 实际观察 | 证据边界 |
|---|---|---|
| 官方 `login workbuddy`、`login workbuddy-cn`，随后分别调用真实 Hy3 Chat | 两次交互授权均 exit 0；重新加载 AuthStorage 后各有一行 OAuth 凭据；分别返回 `WB183_FRESH_INTL_OK`、`WB183_FRESH_CN_OK` | 未保存授权 URL、state、账号或 Token；只验证所用账号的 Hy3 |
| 结束登录进程后重新启动 CLI 的双站 Chat | 分别返回 `WB183_RESTART_INTL_OK`、`WB183_RESTART_CN_OK` | 验证跨进程读取同一隔离 SQLite 持久化凭据 |
| 通过隔离 profile 的真实 `AuthStorage.credentials.set()` 分别将 `expires` 设为过去，随后调用双站 Chat | 过期时各一行；Chat 分别返回 `WB183_REFRESH_INTL_OK`、`WB183_REFRESH_CN_OK`；再次读取各一行且 `expires` 在未来 | 公共 AuthStorage 写入/读取均在 `credentials.reload()` 后进行；不记录凭据内容，也未故意使 refresh token 失效 |
| 同时启动两个官方 headless CLI 进程，分别选 `workbuddy/hy3`、`workbuddy-cn/hy3` | 双方 exit 0，分别返回 `WB183_RC3_PARALLEL_INTL_OK`、`WB183_RC3_PARALLEL_CN_OK`；Intl/CN 首个 `message_update` 分别约 3.05/1.63 秒，总耗时约 3.08/2.16 秒，无 error 事件 | 证明这一次隔离 profile 并发成功；不能解释此前默认 profile 超过 110 秒的无阶段超时 |
| 真实 `task` 工具，临时配置 `modelRoles.task=workbuddy-cn/hy3`，只加载当前扩展与临时只记元数据的观察 hook | 父进程 exit 0，观察到 4 次 `task` start/end，最终含 `WB183_REAL_CN_TASK_OK` 与 `42`；5 次 `session_start` 和 9 次 `before_provider_request` 均为 `workbuddy-cn/hy3`，子会话 `hasUI=false` | 记录了实际子会话请求的 Provider/realm/模型，不记录 Bearer 与 Header 之间的原子身份；隔离 profile 只有一行 CN 凭据，先前真实 CN Chat 已成功 |
| 交互命令 `/workbuddy-cn logout` 后查询账号/模型并调用 Intl Chat，再 `/workbuddy logout` | CN 登出后凭据行数 Intl=1、CN=0；CN 模型列表零行；Intl 返回 `WB183_AFTER_CN_LOGOUT_INTL_OK`；最终 Intl=0、CN=0 | CN 退出后未另发真实 CN Chat；无模型及无凭据为 fail-closed 观察，不能称已观察服务端 CN 拒绝 |
| 清理 | 官方插件卸载后列表为空；仅删除本次创建的隔离 profile 和临时 Task hook 文件 | 默认 profile 凭据未过期、未覆盖、未退出 |

此前默认 profile 的无阶段并发超时仍缺乏可归因事件；随后同 profile 的带时间戳探针与本次隔离 profile 探针成功，均不能证明问题已经消失。18.3.0 的 `resolveHeaders` 仍不暴露所选 Bearer 对应行，单账号/串行换号边界及本地 `X-User-Id` 诊断风险不变。本节没有收集真实请求凭据、Header、OAuth state 或 HTTP 400/413 附件。

## 发布门槛

`rc.3` 仍是兼容性候选，**本增补不批准发布或打 tag**。18.3.0 的受影响路径已完成双站隔离 fresh OAuth、Chat、跨进程重启、强制刷新、一次双站同时发起的 Chat、真实 CN Task 子会话 Provider/模型观察、按 realm 退出及另一 realm 的 Chat 保持可用；CN 退出后凭据与可选模型均为零，但未另发真实 CN Chat。确定性 401/重试和 CN disabled Usage 零请求测试已覆盖契约边界。最终 `npm test` 与 `npm run test:fast` 各 20/20，类型检查、两个 OpenSpec strict 检查、13 文件 pack dry-run 全部通过。首次默认 profile 并发探针超过 110 秒且无阶段记录，后续两次成功不能定位或排除偶发故障；本次不接受未量化的间歇性风险。重新批准前需以可保留阶段事件的隔离复现定位问题，或单独评估并明确接受该风险。旧 M3 的三模型、完整 vision、工具能力等非本次改动范围，保留 18.2.7 历史证据而不宣称 18.3.0 全量重测；故意制造官方 Gateway 401 或 CN Billing 请求不属于本候选必要门槛。历史 M3 勾选与 PASS 只对应 18.2.7。
