# Spec Delta

## MODIFIED Requirements

### Requirement: GATE-01 Compatibility requires server evidence
每项 payload transform 或模型 workaround SHALL 有目标 realm 在删除该处理后会失败的具体 Gateway case、脱敏证据和对应回归场景；证据 SHALL 标明 Provider、Gateway/客户端版本和适用模型。无法说明服务端必要性的变换 SHALL 删除或不启用。国际站已有的 reasoning 清理、named tool choice 规整、特定模型预算上限或 unsupported-field 清理 MUST NOT 因模型 ID 或 Provider family 相同而自动应用到中国站。

#### Scenario: Existing transform has no reproducible justification
- **WHEN** 某项国际站兼容逻辑在中国站没有可复现的 Gateway 失败证据
- **THEN** 中国站不启用该逻辑并使用宿主原生语义，国际站已验证行为保持不变

#### Scenario: Transform has gateway rejection evidence
- **WHEN** 删除变换会在特定 realm 产生可复现的 Gateway 拒绝或错误行为
- **THEN** 只为该 realm 和证据覆盖的模型保留最小变换，并关联证据与行为回归

### Requirement: GATE-03 Request-bound Provider isolation
系统 SHALL 使用 `before_provider_request` 的 request-bound `ctx.model.provider` 区分 `workbuddy`、`workbuddy-cn` 与其他 Provider，payload hook 只实施目标 realm 有证据的兼容变换。活动 scope 与切换期的 fail-closed 约束 SHALL 位于对应 WorkBuddy 模型自身的 `resolveHeaders` 请求边界，并在 transport 前阻断失效或切换中的 retained Model。不得依赖 payload model ID 集合、自定义 transport、全局当前 realm 或共享 mutable workaround 状态实现隔离。

#### Scenario: Another provider uses the same model ID
- **WHEN** `workbuddy`、`workbuddy-cn` 或第三方 Provider 使用相同 model ID
- **THEN** 每个请求只应用其 `ctx.model.provider` 对应的兼容规则、身份和 endpoint，其他 Provider 的请求内容不变

#### Scenario: Retained WorkBuddy model leaves active scope
- **WHEN** 已解析的 WorkBuddy Model 在自身 realm 的 scope 切换中或已不属于活动集合
- **THEN** 该模型的 `resolveHeaders` 在既有 resolver 和 HTTP transport 前 fail closed，该 realm 的 Chat 请求数为零，另一个 realm 的同 ID 模型仍按自身状态工作
