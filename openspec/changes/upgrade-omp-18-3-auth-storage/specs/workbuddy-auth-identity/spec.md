# 认证身份规格增量

## MODIFIED Requirements

### Requirement: AUTH-07 Enforced single effective account
每个 WorkBuddy Provider SHALL 各自只支持一个 stored OAuth credential。OMP 18.3.0 的 `authStorage.oauth.accounts(providerId)` 对目标 Provider 返回零行时视为该 realm 未登录，一行时允许继续，超过一行时该 realm 的模型调用 SHALL 明确拒绝且不得擅自选择、轮换或删除用户凭据。单账号计数不传 session ID；UI 可使用 `oauth.accounts(providerId, sessionId)` 观察当前 session 的 sticky `active` 状态，但 MUST NOT 以 `active` 判断 stored credential 数量。一个 realm 的 credential MUST NOT 计入、满足或修复另一个 realm 的账号约束。

#### Scenario: Multiple stored credentials are detectable
- **WHEN** `oauth.accounts(providerId)` 显示任一 WorkBuddy Provider 有多个 stored OAuth credentials
- **THEN** 明确拒绝该 Provider 的模型调用，不自动选择或删除账号，另一 realm 的单账号调用不受影响

#### Scenario: Sequential account switch in existing session
- **WHEN** 在获授权的隔离 profile 内，realm 中 A 请求结束后退出、B 登录，并在已有 session 与新 subagent 中请求
- **THEN** B 登录后的请求不再带 A 的 Bearer 或身份 Header，且不会读取另一 realm 的 credential

#### Scenario: 同一 stored row 的 session 状态不同
- **WHEN** 一个会话已 pin 唯一账号，另一个会话尚未 pin
- **THEN** 两个会话的 stored row 计数相同；`active` 仅反映各自 session 的选择，不改变单账号约束
