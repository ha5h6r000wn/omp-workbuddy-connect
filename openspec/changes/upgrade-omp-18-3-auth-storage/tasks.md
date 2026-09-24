# OMP 18.3.0 迁移任务

## 接口切换

- [x] 将生产 Provider 的账号查询与删除、UI 的会话账号查询和 Usage 调用迁移到 18.3.0 命名空间，并同步测试中的凭据与 resolver 调用；不增加旧版本 shim。
- [x] 更新 package/lockfile 到 18.3.0，准备未发布的 `1.2.0-rc.3`；修正 README 和 release evidence 的适用版本。

## 已观察验证

- [x] 使用临时 SQLite 中的真实 AuthStorage 验证凭据写入/读取/删除、跨 session `active`、resolver 入口及 Usage 行为；清理临时存储。
- [x] 两种测试运行器各 20/20、类型检查、OpenSpec strict、pack dry-run；在官方隔离 profile 中完成安装、doctor、无凭据模型列表和卸载。
- [x] 使用现有登录态在官方 18.3.0 上验证双站 Hy3 headless Chat、国际站管理积分显示、中国站不可用显示，并确认中国站 `read` 工具返回文件中的精确版本。详细结果及限制见 [`evidence.md`](./evidence.md)。

## 尚未通过的受影响发布门槛

- [x] 18.3.0 真实 AuthStorage + `streamSimple` 契约覆盖 401→强制刷新→重试、逐次 Header 解析和身份校验；独立 UI 回归覆盖 CN disabled Usage 的零调用。不为制造生产 Gateway 401 或 Billing 网络请求而破坏真实账号。
- [ ] 在获授权的隔离 profile 中完成国际站与中国站 fresh OAuth、登录后 Chat、重启后 Chat、各自 forced refresh，以及先 CN logout（CN 拒绝、Intl 仍可 Chat）再 Intl logout；不修改用户默认 profile 的真实凭据。
- [ ] 至少一轮真实 Task，独立记录实际 Provider、模型、realm 与完成结果；排查先前并发探针超时的原因。后续带事件时间戳的双站并发 Chat 已成功，但尚不能解释先前的 110 秒超时。
- [ ] 完成上述 auth-affected 矩阵后重新执行包、测试、类型与 OpenSpec 检查并决定 `rc.3` 发布；不重复与本次迁移无关的三模型、完整 vision、全工具及旧版 M3 能力矩阵。旧 M3 勾选仅对应 OMP 18.2.7。
