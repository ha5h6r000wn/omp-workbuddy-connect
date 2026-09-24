# OMP 18.3.0 迁移任务

## 接口切换

- [x] 将生产 Provider 的账号查询与删除、UI 的会话账号查询和 Usage 调用迁移到 18.3.0 命名空间，并同步测试中的凭据与 resolver 调用；不增加旧版本 shim。
- [x] 更新 package/lockfile 到 18.3.0，准备未发布的 `1.2.0-rc.3`；修正 README 和 release evidence 的适用版本。

## 已观察验证

- [x] 使用临时 SQLite 中的真实 AuthStorage 验证凭据写入/读取/删除、跨 session `active`、resolver 入口及 Usage 行为；清理临时存储。
- [x] 两种测试运行器各 20/20、类型检查、OpenSpec strict、pack dry-run；在官方隔离 profile 中完成安装、doctor、无凭据模型列表和卸载。
- [x] 使用现有登录态在官方 18.3.0 上验证双站 Hy3 headless Chat、国际站管理积分显示、中国站不可用显示，并确认中国站 `read` 工具返回文件中的精确版本。详细结果及限制见 [`evidence.md`](./evidence.md)。

## 受影响发布门槛

- [x] 18.3.0 真实 AuthStorage + `streamSimple` 契约覆盖 401→强制刷新→重试、逐次 Header 解析和身份校验；独立 UI 回归覆盖 CN disabled Usage 的零调用。不为制造生产 Gateway 401 或 Billing 网络请求而破坏真实账号。
- [x] 在获授权的隔离 profile 中完成国际站与中国站 fresh OAuth、登录后 Chat、重启后 Chat、各自 forced refresh；先 CN logout 后 Intl 仍可 Chat，CN 凭据及可选模型均为零，再 Intl logout。CN 退出后未另发真实 Chat 请求；未修改默认 profile。
- [x] 真实 CN Task 记录子会话 Provider/模型、请求前 hook 的 realm/模型与完成结果；隔离 profile 双站同时发起的 Chat 均完成。事件不含 Bearer，不能宣称逐请求原子绑定身份。
- [x] 首次默认 profile 双站并发探针超过 110 秒且无阶段记录，原因仍未定位；后续默认 profile、早先隔离 profile 与本次隔离 profile 连续 10 轮、每轮两进程的有阶段记录并发均成功。本次明确接受**仅限 RC** 的未复现偶发风险，不宣称问题修复或故障率界限。
- [x] auth-affected 矩阵后重新执行包、两种测试运行器、类型与双 OpenSpec strict 检查；隔离稳定性门槛通过后批准 `rc.3` 发布门槛，尚未创建或推送 tag。不重复与迁移无关的三模型、完整 vision、全工具及旧版 M3 能力矩阵；旧 M3 勾选仅对应 OMP 18.2.7。
