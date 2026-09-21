# WorkBuddy Model Catalog Specification

## Purpose

定义 WorkBuddy 模型目录的来源、实际 Gateway 能力、计费可信度和范围切换语义，使用户选择的模型以及 OMP 生成的请求能力一致，避免未知价格被解释成免费或目录更新破坏认证与当前模型选择。

## Requirements

### Requirement: MODEL-01 Gateway-backed model capability
模型目录 SHALL 由真实 OMP 类型约束，并提供完整解析后的 id、name、provider、api、baseUrl、reasoning、thinking、input、contextWindow、maxTokens 和 compat。能力 SHALL 来自产品配置或已验证 Gateway 证据，不得按模型名称猜测；无效模型 ID、格式或预算 SHALL 被明确诊断而非注册为合法模型。

#### Scenario: Three distinct models are discovered
- **WHEN** 目录包含至少三个已确认有效的 WorkBuddy 模型
- **THEN** 选择器展示正确名称、reasoning、context、max tokens、input，且真实请求能力与目录一致

#### Scenario: Invalid product model
- **WHEN** 配置含缺失 ID、非法结构或非正数 token 预算
- **THEN** 无效条目不成为可用模型，来源/错误状态可诊断且不伪造能力

### Requirement: MODEL-02 Supported thinking efforts only
系统 SHALL 用宿主 canonical thinking metadata 区分无 reasoning、必需 effort、允许关闭和不可关闭。minimal/low/medium/high/xhigh/max 只在 Gateway 有支持证据时暴露，标准 reasoning_effort SHALL 由宿主生成，不维护重复映射。

#### Scenario: Required effort cannot be disabled
- **WHEN** 模型声明必须 reasoning 且只支持 high
- **THEN** 宿主不会发送非法 off 或未支持 effort，真实 high 请求正常

#### Scenario: Optional off and supported effort selection
- **WHEN** 模型允许关闭 reasoning 或用户选择其支持的任一 effort
- **THEN** 关闭行为和支持的 effort 请求均正确；不暴露未获证据的其他档位

#### Scenario: Reasoning capability without effort evidence
- **WHEN** 配置只声明支持 reasoning 而没有可信 effort 列表
- **THEN** 不自动宣称支持全部 effort，不按模型家族猜测，使用经验证的宿主默认能力或明确说明能力受限

### Requirement: MODEL-03 Vision matches gateway behavior
Gateway 明确声明支持图片的模型 SHALL 接受 text/image，不能因宿主模型家族默认值静默删除图片；发布前 SHALL 完成真实图片输入验收。

#### Scenario: Gateway vision differs from family defaults
- **WHEN** 产品配置支持图片但宿主默认规则倾向 text-only
- **THEN** 实际请求保留图片并获得正常响应，不能仅靠列表显示 image 判为通过

### Requirement: MODEL-04 Catalog and request budgets agree
contextWindow 与 maxTokens SHALL 与 Gateway 请求预算一致。已获服务端证据的特定模型上限 SHALL 同时约束目录与请求，较小用户预算不得被上调。

#### Scenario: Evidence-backed model token clamp
- **WHEN** 模型有已确认上限且请求预算高于或低于该上限
- **THEN** 目录暴露有效上限，真实请求不超过上限且保留较小合法预算

### Requirement: MODEL-05 Truthful free and all scopes
free SHALL 仅包含有充分免费证据的当前模型；已知付费和未知价格 MUST NOT 因 fallback 或数值占位进入 free。有效目录的免费集合为空时 SHALL 保持为空并明确显示。all SHALL 表示当前插件可识别的全部模型，不保证服务端绝对完整。

#### Scenario: Valid catalog has paid and unknown models only
- **WHEN** 有效目录不存在已确认免费模型
- **THEN** free 显示 empty，不加入 builtin IDs、付费模型或未知价格模型补足列表

#### Scenario: Numeric cost is only metadata placeholder
- **WHEN** 宿主要求 cost 字段而目录只提供未知真实价格的零值占位
- **THEN** UI 与免费过滤不据此声称免费或不消耗积分，实际含义以产品/Billing 证据为准

### Requirement: MODEL-06 Explicit source and controlled fallback
目录 SHALL 使用 M0 ADR 选择的路径，并在 UI/日志说明 `remote`、`desktop-cache` 或 `builtin-fallback`。无可靠在线接口时允许本地缓存不可用后的内置目录，但缺失来源不构成免费证据，不得用 fallback 覆盖有效目录的付费/未知/空免费结论。

#### Scenario: Missing or malformed local cache
- **WHEN** 选择本地路径且产品缓存缺失、不可读或格式损坏
- **THEN** 使用明确标记的内置目录并报告降级原因；内置条目仅凭独立可信证据进入 free，否则免费集合仍为空

#### Scenario: Online path selected by ADR
- **WHEN** M0 决定使用可信在线目录
- **THEN** 目录通过宿主原生动态发现和缓存提供，来源如实显示；scope 与认证约束不因在线刷新绕过

### Requirement: MODEL-07 Scope update consistency and persistence
free/all 切换 SHALL 同步目录、Provider 注册、请求识别 ID 集合、选择器与持久化 scope，不修改 OAuth credential 或要求重新登录；下一次显式 `/workbuddy` 详情 SHALL 反映已提交范围。空列表 SHALL 真正清除旧选择集合，重启后 scope 保持。被新 scope 移除但仍由 session 持有的旧 WorkBuddy Model object MUST NOT 再发起请求，直到用户明确选择范围内模型。

#### Scenario: Re-register while authenticated
- **WHEN** 用户从 free 切换到 all 再切回 free
- **THEN** 目录及请求识别集合匹配当前 scope，credential 保持不变且正确身份投影仍有效

#### Scenario: Current model removed by scope
- **WHEN** 用户切换范围后当前模型不在新目录
- **THEN** 明确提示重新选择，不自动选择其他付费模型或任意 fallback；旧模型对象的下一次 Chat 在 provider transport 前被阻断，观测到零个 WorkBuddy HTTP 请求

#### Scenario: Restart after empty free scope
- **WHEN** 免费集合为空并保存 free 后重启
- **THEN** scope 仍是 free，列表保持 empty，不恢复上次 all 的模型或自动选择 fallback
