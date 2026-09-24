# OMP 18.3.0 迁移任务

## 接口切换

- [x] 将生产 Provider 的账号查询与删除、UI 的会话账号查询和 Usage 调用迁移到 18.3.0 命名空间，并同步测试中的凭据与 resolver 调用；不增加旧版本 shim。
- [x] 更新 package/lockfile 到 18.3.0，准备未发布的 `1.2.0-rc.3`；修正 README 和 release evidence 的适用版本。

## 已观察验证

- [x] 使用临时 SQLite 中的真实 AuthStorage 验证凭据写入/读取/删除、跨 session `active`、resolver 入口及 Usage 行为；清理临时存储。
- [x] 两种测试运行器各 20/20、类型检查、OpenSpec strict、pack dry-run；在官方隔离 profile 中完成安装、doctor、无凭据模型列表和卸载。
- [x] 使用现有登录态在官方 18.3.0 上验证双站 Hy3 headless Chat、国际站管理积分显示、中国站不可用显示，并确认中国站 `read` 工具返回文件中的精确版本。详细结果及限制见 [`evidence.md`](./evidence.md)。

## 未通过的发布门槛

- [ ] 在获授权的隔离 profile 中重跑两站 fresh OAuth、重启、强制刷新、401 重试与请求身份、串行换号和 scoped logout；不修改用户默认 profile 的真实凭据。
- [ ] 确认真实 Task 子进程模型与认证、双站并发 Chat、CN Billing 零网络请求、完整工具/vision/模型范围及诊断隐私。此前并发探针超时，未取得通过结论。
- [ ] 核对 AUTH-04 宿主 request-attempt identity 能力；完成全部受影响真实发布门槛后再决定 `rc.3` 是否可发布。历史 M3 勾选仅属于 OMP 18.2.7。
