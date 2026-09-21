# Spec Delta

## MODIFIED Requirements

### Requirement: MODEL-04 Catalog and request budgets agree
每个 realm 的 contextWindow 与 maxTokens SHALL 与其 Gateway 请求预算一致。已获目标 realm 服务端证据的特定模型上限 SHALL 同时约束该 realm 的目录与请求，较小用户预算不得被上调。模型 ID 相同不足以把一个 realm 的 token clamp 应用到另一个 realm。

#### Scenario: Evidence-backed model token clamp
- **WHEN** 某模型在目标 realm 有已确认上限且请求预算高于或低于该上限
- **THEN** 该 realm 目录暴露有效上限，真实请求不超过上限且保留较小合法预算

#### Scenario: Same model ID lacks matching evidence
- **WHEN** 国际站模型已有 token clamp 而中国站出现相同 model ID 但没有相同上限证据
- **THEN** 中国站不继承国际站 clamp，并在能力未确认时不把该模型注册为已验证可用

#### Scenario: Reasoning consumes the output budget
- **WHEN** 目标 realm 的真实 streaming 证据显示 reasoning token 计入 `max_tokens`，低预算可能以 `finish_reason=length` 结束且 content 为空
- **THEN** transport 保留 reasoning 与 finish reason，不把该响应误判为协议空包或静默重试，不擅自上调用户更小的合法预算；release matrix 同时验证低预算截断与目录预算内正常完成

### Requirement: MODEL-06 Explicit source and controlled fallback
每个 realm 的目录 SHALL 使用其证据与 ADR 选定的来源，并在 UI/日志如实说明 `remote`、`desktop-cache`、`builtin-fallback`、`empty` 或 `unavailable`。国际站保留已验证的 Desktop cache 到 builtin fallback。中国站缓存缺失、不可读或无效且没有独立验证的 builtin 时 SHALL 返回 empty/unavailable，不得使用国际站缓存、builtin IDs 或来源标签，也不得把来源缺失当作免费证据。

#### Scenario: Missing or malformed local cache
- **WHEN** 中国站选择本地目录路径，但缓存缺失、不可读或格式损坏，且没有已验证中国站 builtin
- **THEN** 中国站目录为空并报告 unavailable/empty 及原因，不回退国际站目录或注册未知模型

#### Scenario: International controlled fallback remains
- **WHEN** 国际站本地产品缓存缺失、不可读或格式损坏
- **THEN** 使用明确标记的国际站 builtin 目录并保持既有免费证据约束，中国站目录不受影响

#### Scenario: Online path selected by ADR
- **WHEN** 某 realm 的 ADR 决定使用可信在线目录
- **THEN** 只通过该 realm 已验证的发现与缓存路径提供目录并如实显示来源，不绕过其 scope 与认证约束

### Requirement: MODEL-07 Scope update consistency and persistence
每个 realm 的 free/all 切换 SHALL 独立同步自身目录、Provider 注册、请求识别集合、选择器与持久化 scope，不修改任一 OAuth credential 或另一个 realm 的状态；下一次对应管理命令 SHALL 反映已提交范围。空列表 SHALL 真正清除该 realm 旧选择集合，重启后两个 realm 的 scope 分别保持。被新 scope 移除但仍由 session 持有的旧 Model object MUST NOT 再发起目标 realm 请求，直到用户明确选择范围内模型。

#### Scenario: Re-register while authenticated
- **WHEN** 用户切换中国站 scope，而国际站和中国站均已认证
- **THEN** 仅中国站目录及请求识别集合改变，两个 credential 与国际站目录、scope 和模型引用保持不变

#### Scenario: Current model removed by scope
- **WHEN** 用户切换某 realm 范围后当前模型不在新目录
- **THEN** 明确提示重新选择，不自动选择另一个 realm 或任意付费模型；旧模型对象的下一次 Chat 在该 realm transport 前被阻断

#### Scenario: Restart after empty free scope
- **WHEN** 任一 realm 的免费集合为空并保存 free 后重启
- **THEN** 两个 realm 分别恢复自身 scope，空目录不恢复 all、另一个 realm 或任意 fallback 模型

## ADDED Requirements

### Requirement: MODEL-08 Catalog identity is realm-bound
模型目录项 SHALL 由 Provider ID 与 model ID 的组合标识其 realm，目录加载、缓存解析、免费证据、能力 metadata、错误和来源状态 SHALL 保持 realm 归属。系统 MUST NOT 仅按 model ID 合并两个 realm 的目录或共享 mutable catalog state。

#### Scenario: Both realms publish the same model ID
- **WHEN** 国际站和中国站目录包含相同 model ID
- **THEN** 选择器保留两个不同 Provider 的模型，其 endpoint、能力、价格证据、scope 和请求约束分别来自各自 realm

### Requirement: MODEL-09 Model pricing evidence is realm-bound
模型价格或 credit 倍率 SHALL 由 Provider ID 与 model ID 的组合标识，并保留来源版本、`creditsRaw` 与原始单位。实现 SHALL 将 free evidence 区分为 `explicit-zero`、`non-zero`、`unknown` 或等价的不可混淆状态。即使两个 realm 使用相同 model ID，系统也 MUST NOT 复制、合并或比较未经单位语义验证的价格字段；空值、未知格式或未知单位不得解释为免费。free scope 只有在目标 realm 的独立证据明确表示零成本时才可包含该模型。

#### Scenario: Same model ID has different realm prices
- **WHEN** 国际站和中国站目录包含相同 model ID，但 credit 倍率、单位文本或计费语义不同
- **THEN** 两个 Provider 分别展示并使用各自证据，不以 model ID 复用价格或免费判定

#### Scenario: Price value has unknown semantics
- **WHEN** 目录只提供类似 `credits` 的展示值，但缺少币种、结算单位或 Billing 契约证据
- **THEN** 系统保留该值为来源元数据并标记计费语义未确认，不据此承诺实际费用

### Requirement: MODEL-10 Catalog eligibility is distinct from release validation
模型是否进入某 realm 的 catalog SHALL 由该 realm 来源中的合法 model ID、Chat 类型、有效 input/output budget 和必要 schema 决定；未知 capability 保持未知而不补 true。发布验证 SHALL 选择代表模型对真实 Chat、reasoning、tools 与声明的 vision 做 gate，不得把“未逐一 live 测试”作为排除其他 catalog-eligible 模型的理由，也不得把 catalog metadata 当作对应能力已实测。

#### Scenario: Many cache models are schema-valid
- **WHEN** 中国站缓存包含多个满足 Chat schema 与预算要求的模型，而 release matrix 只对三个代表模型做 live gate
- **THEN** 所有 catalog-eligible 模型可按各自 scope 出现在目录中；只有通过 live gate 的具体能力可标记为 release-validated

#### Scenario: Cache row lacks required Chat metadata
- **WHEN** 条目缺少合法 ID、有效 input/output budget、必要 schema，或明确属于非 Chat 类型
- **THEN** 该条目不注册为 Chat 模型，即使它有名称、credits 或与另一 realm 的 model ID 相同
