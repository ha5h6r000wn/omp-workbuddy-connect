# OMP 18.3.0 AuthStorage 接口迁移

## 背景

OMP 18.3.0 移除了插件在 18.2.7 中使用的 AuthStorage 平铺账号查询、凭据删除、Usage 和 resolver 方法。已安装插件查询账号时因此报错。原开发依赖锁定在 18.2.7，无法通过类型检查发现新宿主契约断裂。

## 变更

- Provider 和 UI 改用 18.3.0 的 `oauth`、`credentials`、`usage` 命名空间；测试凭据和 resolver 调用同步迁移至 `keys.resolver` 等新入口。不添加双版本 shim，不修改 WorkBuddy 服务协议。
- 将包和锁文件中的宿主依赖精确锁定为 18.3.0，形成 `1.2.0-rc.3` 发布候选，并基于定向验收批准 RC 发布。
- 使用真实 AuthStorage、确定性契约测试及官方宿主路径验证；18.3.0 的定向真实结果、未定位并发异常的 RC 剩余风险接受，与 18.2.7 的 M3 发布批准分别记录。`v1.2.0-rc.3` 发布标记指向包含本次证据的最终提交。

## 影响范围

生产代码：`src/provider.ts`、`src/ui.ts`。测试：现有认证、Provider、UI 和契约用例。分发：`package.json`、`package-lock.json`、README 和发布证据。历史 `add-workbuddy-cn-realm` 的 M0–M3 勾选项只对应 18.2.7 验收，不在本变更中重置或重新批准。
