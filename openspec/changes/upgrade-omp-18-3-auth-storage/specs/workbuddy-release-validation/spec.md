# 发布验收规格增量

## MODIFIED Requirements

### Requirement: REL-06 Honest compatibility and limitations
发布文档 SHALL 明示本次候选的 OMP 18.3.0 精确版本、两个 realm 的支持范围、单账号约束、宿主身份绑定限制及未验证能力。项目不维护旧 OMP 兼容矩阵；旧版宿主的 M3 发布批准 MUST NOT 自动视为新宿主的验收。真实宿主、真实服务、确定性 fixture 和未运行场景 SHALL 分别记录；发布前 MUST 重验当前稳定宿主上受影响的登录、刷新、请求、管理和安全矩阵。

#### Scenario: 宿主升级后仅完成部分真实冒烟
- **WHEN** 新宿主的类型、回归及现有登录态的少量真实 Chat 已通过，但 fresh OAuth、重启/刷新、认证后 Task 或并发隔离未完整通过
- **THEN** 文档列出各项已观察结果与未通过门槛，候选不宣称获得发布批准，也不继承旧版宿主的完整矩阵 PASS

#### Scenario: User reads installation and migration instructions
- **WHEN** 用户依据 README 安装、选择 realm 或迁移
- **THEN** 能区分尚未发布的候选与已发布的旧版本，不会被告知旧环境凭据、另一 realm 的凭据或缺失的真实验证可以自动替代当前宿主验收
