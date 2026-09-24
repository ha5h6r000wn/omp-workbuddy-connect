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
| `npm run typecheck`、`npx openspec validate add-workbuddy-cn-realm --strict`、`npm pack --dry-run` | 通过；pack 列出 13 个文件 | 包与契约门槛，不证明账号授权 |
| 官方 CLI 隔离 profile：`plugin install .`、`plugin doctor`、`models workbuddy --json`、`plugin uninstall` | 安装、卸载成功；doctor 中插件为 `ok`；无凭据时模型列表为空；新 profile 的 `package_manifest` 为“Not created yet”警告 | 隔离 profile 未执行 OAuth |
| 使用现有登录态、关闭默认扩展发现并显式加载当前源码（`--no-extensions -e ./extensions/workbuddy.ts`），分别对 `workbuddy/hy3` 和 `workbuddy-cn/hy3` 执行 `-p --no-session --no-tools` | 分别返回 `WB183_INTL_OK`、`WB183_CN_OK` | 非 fresh OAuth、重启或强制刷新 |
| 国际站 headless Read 提示 | 返回 `WB183_TOOL_VERSION=1.2.0-rc.3` | 仅凭答案不能独立证明工具调用 |
| 中国站 headless Read 的 JSON 事件 | 观察到 `read` start/end；读取 `package.json` 后 assistant 返回精确值 `CN_PACKAGE_VERSION=1.2.0-rc.3` | 现有登录态下的只读工具路径，不是 fresh OAuth |
| 官方交互式 TUI 加载当前源码后执行 `/workbuddy`、`/workbuddy-cn` | 国际站显示“积分可用”，中国站显示“积分不可用” | 本次未实测中国站 Billing 网络请求数；确定性双站契约覆盖零请求 |
| 国际站模型下的 headless `task` 请求 | 观察到 `task` start/end 和最终回答标记 | 未独立记录子进程实际模型、realm 和认证身份；不能计入真实 WorkBuddy Task E2E |
| 双站并发 headless 探针 | 两个进程超过 110 秒观察期限后被停止 | 未取得并发结果或根因，**不通过** |

本增补未记录原始账号标识、Token、Authorization、请求体或 OAuth state。现有用户 profile 用于非破坏性 Chat、只读工具、Task 调用及管理界面观察；未执行 logout、覆盖凭据、scope 切换或强制过期。Task 子进程身份未确认，不据此声称完整的无副作用证明。

## 发布门槛

`rc.3` 仍是兼容性候选，**本增补不批准发布**。OMP 18.3.0 上的双站 fresh OAuth、重启恢复、强制刷新、逐次重试身份绑定、已确认子模型的真实 Task、串行换号及 scoped logout、完整 main/headless 能力、工具/vision/三模型矩阵、中国站 Billing 零网络请求和官方诊断隐私检查尚未作为完整真实矩阵重验。Fresh login 及破坏性 logout/expiry 操作需要获授权的隔离账号与 profile、交互式授权；未在用户现有 profile 上执行。并发超时问题也未闭环。历史 M3 的勾选和 PASS 只对应 OMP 18.2.7。
