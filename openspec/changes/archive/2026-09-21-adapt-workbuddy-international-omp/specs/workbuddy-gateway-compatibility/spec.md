# Spec Delta

## Purpose

定义 WorkBuddy Gateway 与宿主原生 OpenAI-compatible 请求间的最小差异及证据要求，保证请求隔离、提示语义、工具往返关联和流式响应可靠，不在插件中复制宿主已有的传输及错误处理能力。

## ADDED Requirements

### Requirement: GATE-01 Compatibility requires server evidence
每项 payload transform SHALL 有删除后会失败的具体 Gateway case、脱敏证据和对应回归场景；无法说明服务端必要性的变换 SHALL 删除。候选包括 reasoning 历史清理、tool_choice 规整、特定模型预算上限和 unsupported-field 清理，但候选不等于无条件保留。

#### Scenario: Existing transform has no reproducible justification
- **WHEN** 旧逻辑无法指出缺失该变换时的 Gateway 失败案例
- **THEN** 不因 upstream 既有行为自动保留，而从插件差异层移除并验证原生请求

#### Scenario: Transform has gateway rejection evidence
- **WHEN** 删除变换会产生可复现的 Gateway 拒绝或错误行为
- **THEN** 只保留该失败案例所需的最小变换，并关联证据、适用模型和行为回归

### Requirement: GATE-02 Native semantics and prompt preservation
标准 stream、developer/system 兼容、reasoning_effort、max token 转换与工具流解析 SHALL 优先由宿主负责，不得重复覆盖。除非真实 Gateway 已证明缺少 system message 会失败，插件 MUST NOT 自动插入系统提示词或改变用户 prompt semantics。

#### Scenario: Request has no system message
- **WHEN** 原生请求没有 system message 且没有证据表明 Gateway 要求它
- **THEN** 插件不插入 `You are a helpful assistant.` 或其他系统提示词

#### Scenario: Host already emits standard fields
- **WHEN** 原生 transport 已正确生成 stream、role、reasoning_effort 和 max_tokens
- **THEN** 插件保留其标准语义，仅实施有证据的 WorkBuddy 差异

### Requirement: GATE-03 Request-bound Provider isolation
系统 SHALL 使用 `before_provider_request` 的 request-bound `ctx.model.provider` 识别 WorkBuddy 请求，payload hook 仅实施有证据的兼容变换。活动 scope 与切换期的 fail-closed 约束 SHALL 位于 WorkBuddy 模型自身的 `resolveHeaders` 请求边界，并在 transport 前阻断失效或切换中的 retained Model。不得依赖 payload model ID 集合、自定义 transport 或全局拦截实现隔离。

#### Scenario: Another provider uses the same model ID
- **WHEN** 其他 Provider 使用当前或历史 WorkBuddy model ID
- **THEN** `ctx.model.provider` 不是 `workbuddy`，请求内容、消息、tools、tool_choice 和标准字段均不改变

#### Scenario: Retained WorkBuddy model leaves active scope
- **WHEN** 已解析的 WorkBuddy Model 在 scope 切换中或已不属于活动集合
- **THEN** 宿主可先完成当前 attempt 的凭据选择，但其 `resolveHeaders` SHALL 在既有 resolver 和 HTTP transport 前 fail closed，WorkBuddy Chat 请求数为零

### Requirement: GATE-04 Reasoning cleanup preserves tool history
有证据需要 reasoning replay 清理时，系统 SHALL 仅清理 Gateway 不接受的 assistant reasoning 表达，保留普通内容、assistant tool calls、tool_call_id、工具结果及关联，不破坏下一轮消息历史。

#### Scenario: Assistant reasoning and tools share history
- **WHEN** 多轮历史同时包含 reasoning、assistant tool calls 和 tool results
- **THEN** Gateway 接受清理后的历史，工具结果仍关联正确调用，下一轮能基于工具结果回答

### Requirement: GATE-05 Complete tool calling loop
系统 SHALL 支持单工具、连续工具、多工具、tool arguments streaming、auto 与 named tool_choice；模型支持时验证 parallel/multi tool。工具定义到执行、结果、下一轮响应 SHALL 保持正确关联，由宿主解析工具流。

#### Scenario: Sequential and multiple tool calls
- **WHEN** WorkBuddy 模型发出单次、连续或多工具调用
- **THEN** OMP 正确执行工具并把结果回送对应调用，最终返回结合结果的回答而非只产生 tool delta

#### Scenario: Named choice with streamed arguments
- **WHEN** 请求指定 named tool_choice 且 Gateway 分片返回 arguments
- **THEN** 经已验证最小规整选择正确工具，宿主拼接出可执行参数并完成下一轮

### Requirement: GATE-06 Native streaming and failure semantics
Chat SHALL 始终复用 `openai-completions` 的 text/reasoning/tool delta、usage、DONE、HTTP error、Abort 和 Retry 语义。插件 MUST NOT 新建 SSE parser、tool delta parser、stream retry、全局 fetch interceptor 或自定义 Chat HTTP client；错误 SHALL 保留宿主有用诊断信息且不泄露凭据。

#### Scenario: Stream completes with usage
- **WHEN** Gateway 返回 text/reasoning/tool deltas、usage 和 `[DONE]`
- **THEN** 宿主正常呈现内容和用量并结束流，没有插件自建解析器参与

#### Scenario: HTTP error abort and retry
- **WHEN** 请求非 2xx、用户中止或出现宿主可重试条件
- **THEN** 原始有用错误得以保留，中止及时生效，重试仅由宿主执行且无双重请求重试循环
