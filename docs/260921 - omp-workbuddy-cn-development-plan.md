# OMP WorkBuddy Connect：国内版接入开发计划

> 目标版本建议：`v1.2`
>
> 核心原则：**一套实现，两个安全隔离的 WorkBuddy realm**。
>
> - `workbuddy`：现有 WorkBuddy 国际版，保持兼容
> - `workbuddy-cn`：新增 WorkBuddy 国内版
> - 底层认证、Provider、模型、Payload、UI 等逻辑尽量复用
> - 仅把真正的站点差异抽成轻量 `WorkBuddySite` 配置
> - 小团队快速迭代优先，不引入没有现实收益的抽象和基础设施
>
> **Protocol details superseded:** 本文保留里程碑与历史设计背景；具体 endpoint/header/auth/model 协议以 [`openspec/changes/add-workbuddy-cn-realm/design.md`](../openspec/changes/add-workbuddy-cn-realm/design.md)、对应 specs/tasks 和 [`m0-evidence.md`](../openspec/changes/add-workbuddy-cn-realm/m0-evidence.md) 为准。发生冲突时不得按本文旧示例实现。

---

## 1. 背景

当前仓库已实现 WorkBuddy 国际版 OMP Provider，主要结构为：

```text
extensions/
└── workbuddy.ts

src/
├── auth.ts
├── credits.ts
├── models.ts
├── payload.ts
├── provider.ts
├── settings.ts
├── ui.ts
└── workbuddy-api.ts
```

现有实现已经具备较清晰的职责边界：

- `extensions/workbuddy.ts`
  - OMP 生命周期
  - Provider 注册
  - `/workbuddy` 命令
  - scope 切换
- `src/auth.ts`
  - OAuth 登录
  - token refresh
  - credential identity 校验
- `src/provider.ts`
  - OMP Provider 配置
  - AuthStorage 绑定
  - request header identity 校验
  - logout / lifecycle
- `src/workbuddy-api.ts`
  - WorkBuddy HTTP API
  - OAuth protocol
  - Billing API
- `src/models.ts`
  - Desktop 产品配置解析
  - free/all scope
  - reasoning metadata
- `src/payload.ts`
  - WorkBuddy Gateway payload compatibility
- `src/settings.ts`
  - scope 持久化
- `src/credits.ts`
  - Usage / Credits
- `src/ui.ts`
  - `/workbuddy` 状态与 UI

因此，本次不应新建一套“中国版实现”，而应在现有边界之上增加一个非常薄的“站点配置层”。

---

# 2. 目标

## 2.1 功能目标

在同一个插件中同时支持：

### WorkBuddy 国际版

```text
Provider ID: workbuddy
Login:       /login workbuddy
Command:     /workbuddy
```

### WorkBuddy 国内版

```text
Provider ID: workbuddy-cn
Login:       /login workbuddy-cn
Command:     /workbuddy-cn
```

两者要求：

- credential 独立存储
- OAuth 生命周期独立
- Header / Origin / X-Domain 独立
- 模型目录独立
- scope 设置独立
- logout 独立
- Chat / Tools / Vision / Reasoning 独立工作
- 任何情况下不得把一个 realm 的 credential 用到另一个 realm

---

## 2.2 架构目标

实现：

```text
OMP
│
├── provider: workbuddy
│     └── site = international
│
└── provider: workbuddy-cn
      └── site = china
            │
            ▼
      Shared Implementation
      ├── auth.ts
      ├── provider.ts
      ├── workbuddy-api.ts
      ├── models.ts
      ├── payload.ts
      ├── settings.ts
      ├── credits.ts
      └── ui.ts
```

核心形式：

```ts
createWorkBuddyProvider(site)
loginWorkBuddy(site)
loadProductConfig(site)
loadSettings(site)
```

而不是：

```text
workbuddy-intl.ts
workbuddy-cn.ts
```

复制整套实现。

---

# 3. 非目标

以下能力 **不属于 v1.2 首版范围**。

## 3.1 不做多账号

仍维持当前约束：

```text
每个 Provider 仅允许一个有效 WorkBuddy Account
```

因此：

```text
workbuddy    → 最多一个国际账号
workbuddy-cn → 最多一个国内账号
```

不实现：

- 账号池
- 自动换号
- round-robin
- credential rotation

---

## 3.2 不做国内 / 国际自动路由

不实现：

```text
根据模型自动决定 CN / Intl
```

也不实现：

```text
CN 请求失败 → fallback Intl
Intl 请求失败 → fallback CN
```

两个 Provider 是两个独立的 trust realm。

用户明确选择：

```text
workbuddy/model-x
```

或：

```text
workbuddy-cn/model-x
```

---

## 3.3 不做在线动态模型目录

v1.2 继续沿用现有模式：

```text
Desktop 产品配置
        ↓
解析模型目录
        ↓
注册 OMP Provider
```

暂不引入：

```text
/v3/config
console model API
online discovery
last-good remote catalog
```

原因：

- 会显著增加生命周期复杂度
- 首次未登录状态不好处理
- 登录后需重新发现模型
- token refresh / enterprise 切换可能触发目录变化
- 当前需求没有必须在线 discovery 的证据

---

## 3.4 不为架构美观改名现有 Provider

不做：

```text
workbuddy → workbuddy-intl
```

原因：

- 破坏已存 AuthStorage credential
- 影响现有用户
- 影响现有 `/login workbuddy`
- 迁移收益很低

保持：

```text
workbuddy    = 国际版
workbuddy-cn = 国内版
```

---

## 3.5 不提前建设通用 Provider Framework

不新增：

```text
Adapter
Strategy
RegionManager
EndpointResolver
CredentialRouter
ProviderRegistry
```

除非后续出现第三个真实站点并且产生明确重复代码。

---

# 4. 核心设计

## 4.1 站点描述符边界

早期 `origin/apiBase/xDomain` 三字段草图已被 M0 证据证伪：CN 的 API origin、Chat/Auth paths、Web login origin、credential-derived domain、start request shape、poll timing 和 account finalize 是独立维度，不能通过替换 base URL 表达。

最终 `SiteDescriptor` 只按真实调用点表达不可变协议差异；不得包含 credential、scope、generation、registry 或 session，也不得扩展成 Adapter/Strategy 框架。字段与验收以当前 OpenSpec design/specs 为准。

## 4.2 国际版迁移边界

M1 只把现有国际站常量机械迁入 descriptor/runtime closure，Provider ID、命令、OAuth request shape、poll timing、缓存/settings、Usage、UI 和 Gateway workaround 均保持现有行为。任何行为差异先修复，不与 CN 实现一起解释为预期变更。

## 4.3 国内版证据边界

不再保留旧版推测 CN API base、固定 `X-Domain` 或 CN builtin 示例。CN API/Auth/Catalog、隔离探针 Chat candidate、credential-derived domain、account finalize、stream-only 约束、无 UsageProvider/无 builtin 决定，全部以 change-local `m0-evidence.md` 为准。

隔离探针成功使用的 Chat URL/header 在生产装配前仍须由脱敏 OMP 出站记录复核；domain restart recovery 与 durable uid finalize 未闭环前不得注册生产 `workbuddy-cn`。

# 5. 安全边界

这是本次改造最重要的设计要求。

## 5.1 Provider ID 即 Credential Namespace

国际：

```text
AuthStorage["workbuddy"]
```

国内：

```text
AuthStorage["workbuddy-cn"]
```

禁止两个站点共用：

```text
AuthStorage["workbuddy"]
```

再额外通过 region 字段区分。

---

## 5.2 Credential 不允许跨 Realm

必须测试：

```text
Intl credential
    ×
workbuddy-cn request
```

必须失败。

同样：

```text
CN credential
    ×
workbuddy request
```

必须失败。

---

## 5.3 Auth URL 继续使用 Allowlist

当前国际版存在：

```ts
parsedAuthUrl.origin === WORKBUDDY_ORIGIN
```

参数化后不能降低校验强度。

错误方案：

```ts
if (url.startsWith("https://")) {
  accept();
}
```

正确方案：

```ts
if (!site.authOrigins.includes(parsedAuthUrl.origin)) {
  throw ...
}
```

如果国内登录流程跳转到多个可信腾讯域名：

```ts
authOrigins: [
  "...",
  "...",
]
```

通过明确 allowlist 扩展。

---

## 5.4 保留现有身份一致性校验

以下逻辑不因 CN 支持而弱化：

```text
exactly one stored account
accountId match
orgId match
credentialId stable
AuthStorage binding stable
header resolution 前后身份一致
```

CN 仅改变：

```text
providerId
endpoint
origin
domain
```

不改变身份安全模型。

---

# 6. 文件级改造方案

## 6.1 `src/site.ts`

### 新增职责

仅负责：

```text
站点静态差异
```

包括：

- Provider ID
- 显示名
- command
- origin
- apiBase
- X-Domain
- auth platform
- auth origin allowlist
- model cache path
- settings path
- usage capability

不得放入：

- HTTP 请求逻辑
- OAuth 流程逻辑
- credential validation
- model parsing
- OMP lifecycle

---

## 6.2 `src/workbuddy-api.ts`

当前大量依赖全局常量：

```ts
WORKBUDDY_ORIGIN
WORKBUDDY_API_BASE
WORKBUDDY_PROTOCOL_HEADERS
```

改造为 site-aware。

### 目标接口

```ts
startPluginLogin(site, fetcher, options)

pollPluginToken(
  site,
  state,
  fetcher,
  options,
)

refreshPluginToken(
  site,
  refreshToken,
  enterpriseId,
  fetcher,
  options,
)

fetchWorkBuddyBillingEnvelope(
  site,
  credential,
  fetcher,
  signal,
)
```

### Header

改：

```ts
function protocolHeaders(site: WorkBuddySite) {
  return {
    Accept: "...",
    "Content-Type": "application/json",
    Origin: site.origin,
    Referer: `${site.origin}/`,
    "User-Agent": WORKBUDDY_USER_AGENT,
    "X-Requested-With": "XMLHttpRequest",
    "X-Product": "SaaS",
  };
}
```

### Auth URL 校验

使用：

```ts
site.authOrigins
```

而不是固定：

```ts
WORKBUDDY_ORIGIN
```

---

## 6.3 `src/auth.ts`

当前：

```ts
loginWorkBuddy(...)
refreshWorkBuddyOAuth(...)
```

改：

```ts
loginWorkBuddy(
  site,
  callbacks,
  fetcher,
  now,
)

refreshWorkBuddyOAuth(
  site,
  credentials,
  fetcher,
  now,
  signal,
)
```

其他逻辑尽量保持不动。

特别是：

```text
credentialFromLoginResponse
oauthFromWorkBuddy
validateRequestCredential
validateStoredCredential
refresh identity validation
```

不要为了 CN 重写。

---

## 6.4 `src/provider.ts`

当前：

```ts
createWorkBuddyProvider(fetcher)
```

改：

```ts
createWorkBuddyProvider(
  site,
  fetcher,
)
```

### Provider ID

所有：

```ts
WORKBUDDY_PROVIDER
```

依赖应转为：

```ts
site.providerId
```

例如：

```ts
authStorage.listOAuthAccounts(site.providerId)
```

### Provider Config

```ts
{
  baseUrl: site.apiBase,

  headers: {
    ...
    Origin: site.origin,
    Referer: `${site.origin}/`,
    "X-Domain": site.xDomain,
  },

  oauth: {
    name: site.displayName,
    ...
  }
}
```

### Usage

仅在：

```ts
site.usageMode === "resource"
```

时注册现有 usage provider。

CN 第一 RC 默认允许：

```text
usage = unsupported / unavailable
```

但 Chat plane 必须完全正常。

---

## 6.5 `src/models.ts`

改：

```ts
loadProductConfig(site)
```

或者：

```ts
loadProductConfig(
  path = productConfigPath(site),
)
```

### 国际版

保持：

```text
~/.workbuddy-ai/cache/acc-product-config-v3.json
```

### 国内版

使用经验证后的国内 Desktop cache。

### 禁止跨站 fallback

禁止：

```text
CN cache missing
→ read Intl cache
```

### Builtin Models

改成 realm-aware：

```ts
const BUILTIN_MODELS = {
  intl: [...existingIntlModels],
  cn: [],
};
```

CN 第一版：

```text
没有可信缓存
→ 不猜模型
```

等真实证据稳定后再增加国内 fallback。

---

## 6.6 `src/settings.ts`

改：

```ts
workBuddySettingsPath(site, agentDir)
loadSettings(site, agentDir)
saveSettings(site, scope, agentDir)
```

文件：

```text
Intl → .workbuddy-settings.json
CN   → .workbuddy-cn-settings.json
```

国际文件名不得修改。

---

## 6.7 `src/credits.ts`

第一阶段尽量不改 parser。

只让创建函数支持 site：

```ts
createWorkBuddyUsageProvider(
  site,
  validateCredential,
)
```

如果：

```ts
site.usageMode === "none"
```

则不注册 Usage Provider。

待真实 CN Billing probe 后再决定是否：

```text
none → resource
```

---

## 6.8 `src/ui.ts`

UI Controller 尽量参数化：

```ts
new WorkBuddyUiController(
  site,
  stateGetter,
)
```

主要处理：

- 显示名
- Provider ID
- command 文案

不要复制：

```text
WorkBuddyUiController
WorkBuddyCnUiController
```

---

## 6.9 `extensions/workbuddy.ts`

将当前单实例逻辑抽成：

```ts
async function registerWorkBuddySite(
  pi: ExtensionAPI,
  site: WorkBuddySite,
) {
  ...
}
```

最终：

```ts
export default async function (pi: ExtensionAPI) {
  await registerWorkBuddySite(
    pi,
    WORKBUDDY_INTL,
  );

  await registerWorkBuddySite(
    pi,
    WORKBUDDY_CN,
  );
}
```

每个 site 拥有独立：

```text
provider
scope
catalog
models
activeIds
transitioning
ui
```

---

# 7. 命令设计

## 国际版

维持：

```text
/login workbuddy

/workbuddy
/workbuddy free
/workbuddy all
/workbuddy logout
```

---

## 国内版

新增：

```text
/login workbuddy-cn

/workbuddy-cn
/workbuddy-cn free
/workbuddy-cn all
/workbuddy-cn logout
```

---

# 8. 模型身份

即使 CN / Intl 出现相同 model id：

```text
deepseek-v4.1-flash
```

也没问题。

OMP 中完整身份为：

```text
provider + model
```

因此：

```text
workbuddy/deepseek-v4.1-flash
```

和：

```text
workbuddy-cn/deepseek-v4.1-flash
```

天然隔离。

不需要给 model id 增加：

```text
cn-
intl-
```

前缀。

---

# 9. 实施阶段

建议拆成三个 PR。

---

## PR 1：站点参数化重构

### 目标

> 只重构，不增加任何 CN 功能。

新增：

```text
src/site.ts
```

定义：

```text
WORKBUDDY_INTL
```

然后让现有实现全部基于：

```text
site
```

运行。

### 约束

必须满足：

```text
用户行为不变
Provider ID 不变
AuthStorage 不变
settings 文件不变
模型列表不变
Headers 不变
OAuth URL 不变
Billing 不变
现有测试全部通过
```

### PR1 Done Definition

- `npm test` 全通过
- `npm run typecheck` 全通过
- 国际 OAuth live gate 通过
- 国际 Chat live gate 通过
- 国际 Tools live gate 通过
- 国际 Vision live gate 通过
- main / Task role 不回归
- diff 中无 CN endpoint
- 无用户可见行为变化

---

# 10. PR 2：新增 `workbuddy-cn`

### 目标

建立国内独立 Provider。

新增：

```text
WORKBUDDY_CN
```

注册：

```text
workbuddy-cn
```

### 初始能力

必须支持：

```text
OAuth Login
OAuth Poll
Refresh
Chat
Reasoning
Tool Call
Vision
Logout
free/all scope
headless
```

可以暂不支持：

```text
Billing / Credits
Online model discovery
Builtin fallback
```

### PR2 Done Definition

Mock / contract 层证明：

- `workbuddy` 与 `workbuddy-cn` 可同时注册
- 两边 AuthStorage namespace 不同
- Origin 不同
- X-Domain 不同
- apiBase 不同
- settings 文件不同
- logout 仅删除当前 Provider credential
- Intl credential 无法通过 CN identity validation
- CN credential 无法通过 Intl identity validation
- CN scope 切换不会修改 Intl
- Intl scope 切换不会修改 CN

---

# 11. PR 3：真实 CN Gateway 验证

PR3 主要目标：

> 把所有推测替换为真实证据。

---

## 11.1 OAuth Probe

验证：

```text
POST /v2/plugin/auth/state
GET  /v2/plugin/auth/token
POST /v2/plugin/auth/token/refresh
```

记录：

```text
server
platform
Origin
Referer
X-Domain
authUrl origin
response shape
pending code
refresh response shape
```

---

## 11.2 Credential Probe

验证返回：

```text
uid
enterpriseId
email
nickname
expiresIn
```

是否与国际版 parser 兼容。

如果字段不同：

只在：

```text
credentialFromLoginResponse()
```

增加最小兼容分支。

不得重写整个 CN auth。

---

## 11.3 Chat Probe

验证：

```text
POST /v2/chat/completions
```

检查：

```text
streaming
Authorization
X-User-Id
X-Enterprise-Id
X-Domain
Origin
Referer
```

---

## 11.4 Reasoning Probe

至少验证一个 reasoning 模型：

```text
low
medium
high
```

具体档位以国内产品目录为准。

不得按模型名称猜 reasoning capability。

---

## 11.5 Tool Probe

验证：

```text
tool definition
tool call
tool result
继续生成
```

特别检查：

```text
tool_choice
```

国内 Gateway 是否与国际版具有同样限制。

如果没有真实 400 证据：

> 不额外增加 CN-specific workaround。

---

## 11.6 Vision Probe

至少验证：

```text
text + image
```

确认：

```text
supportsImages
```

与产品目录一致。

---

## 11.7 Agent Probe

必须验证：

```text
main
Task role
spawned subagent
```

避免只有手工 Chat 成功，但 OMP agent runtime 失败。

---

## 11.8 Headless Probe

验证无 UI 环境：

```text
不调用 select
不调用 notify
不调用 widget
不调用 status
```

与国际版行为一致。

---

# 12. Billing / Credits 决策

CN 第一 RC 默认：

```text
usageMode = none
```

单独探测：

```text
POST /v2/billing/meter/get-user-resource
```

只有满足以下条件才启用：

- HTTP 路径稳定
- Header 要求明确
- Response envelope 与当前 parser 兼容
- 数字含义明确
- 多次调用结果稳定
- 真实 0 与 unavailable 可区分

如果不满足：

```text
保持 usageMode = none
```

不要为了 UI 完整度增加不可靠额度实现。

---

# 13. Builtin Models 决策

## Intl

继续保留当前已验证 fallback。

## CN

第一版建议：

```ts
cn: []
```

也就是：

```text
Desktop cache valid
→ 使用 cache

Desktop cache missing / invalid
→ 不猜模型
```

后续只有获得稳定官方证据后才加入 builtin。

---

# 14. 测试策略

原则：

> 参数化共享 contract，不复制两套测试。

---

## 14.1 Shared Contract

现有：

```text
auth.test.mts
provider.test.mts
oauth-protocol.test.mts
model-catalog.test.mts
scope.test.mts
settings.test.mts
payload.test.mts
...
```

优先改成：

```ts
for (const site of TEST_SITES) {
  ...
}
```

---

## 14.2 Site-specific Tests

新增少量测试即可：

### Identity Isolation

```text
Intl credential × CN Provider → reject
CN credential × Intl Provider → reject
```

### Header Isolation

断言：

```text
Intl Origin != CN Origin
Intl X-Domain != CN X-Domain
```

### Storage Isolation

```text
logout intl
```

不能删除：

```text
workbuddy-cn
```

反之亦然。

### Settings Isolation

```text
/workbuddy all
```

不得改变：

```text
workbuddy-cn scope
```

---

# 15. 回归重点

此次改动最容易回归的不是 Chat，而是以下四点。

## 15.1 Provider 常量遗漏

搜索所有：

```text
WORKBUDDY_PROVIDER
WORKBUDDY_ORIGIN
WORKBUDDY_API_BASE
```

确保真正需要 realm-aware 的位置全部参数化。

---

## 15.2 UI / Command 串状态

因为两个 site 同时注册，要避免：

```text
CN /workbuddy-cn
```

读取到 Intl：

```text
scope
catalog
models
ui state
```

每个 `registerWorkBuddySite()` 必须拥有独立闭包状态。

---

## 15.3 Logout 误删

必须断言：

```text
/workbuddy logout
```

只删除：

```text
AuthStorage["workbuddy"]
```

而：

```text
AuthStorage["workbuddy-cn"]
```

保持不变。

---

## 15.4 Global Hook 影响其他 Provider

当前存在：

```ts
pi.on("before_provider_request", ...)
```

双 site 后判断应为：

```text
当前 model.provider 是否属于当前 site
```

不得让 WorkBuddy payload normalization 影响：

```text
OpenAI
Anthropic
Gemini
其他 OMP Provider
```

---

# 16. 代码审查原则

后续每个 PR 都建议按以下问题检查。

## 16.1 是否增加了不必要的抽象？

如果新增：

```text
Manager
Factory
Registry
Strategy
Resolver
Adapter
```

必须回答：

> 当前是否至少有两个真实不同实现需要它？

否则删除。

---

## 16.2 CN 特殊逻辑是否有真实证据？

任何：

```ts
if (site.id === "cn") {
  ...
}
```

都必须能解释：

```text
是哪一次真实 Gateway / Client probe 证明必须这样做？
```

否则不应加入。

---

## 16.3 是否破坏国际版已有行为？

PR1 / PR2 必须特别检查：

```text
Provider ID
AuthStorage key
settings filename
OAuth platform
model fallback
tool_choice workaround
Flash maxTokens clamp
Usage behavior
```

---

## 16.4 是否降低身份验证强度？

禁止为了兼容 CN：

```text
skip accountId check
skip orgId check
allow arbitrary auth origin
fallback to another stored account
```

---

# 17. 发布策略

建议：

```text
v1.1.8
   ↓
v1.2.0-rc.1
   ↓
CN live validation
   ↓
v1.2.0
```

---

## RC 阶段

README 明确：

```text
workbuddy
→ WorkBuddy International

workbuddy-cn
→ WorkBuddy China
```

并声明：

```text
CN support is validated against ...
```

具体版本和客户端证据写入 release evidence。

---

# 18. Release Gate

正式发布 `v1.2.0` 前必须全部满足。

## Build

- [ ] `npm test`
- [ ] `npm run typecheck`

## Intl Regression

- [ ] Login
- [ ] Refresh
- [ ] Chat
- [ ] Reasoning
- [ ] Tools
- [ ] Vision
- [ ] Credits
- [ ] `/workbuddy`
- [ ] free/all
- [ ] logout
- [ ] main agent
- [ ] Task role
- [ ] headless

## CN

- [ ] Login
- [ ] Poll
- [ ] Refresh
- [ ] Chat
- [ ] Reasoning
- [ ] Tools
- [ ] Vision
- [ ] `/workbuddy-cn`
- [ ] free/all
- [ ] logout
- [ ] main agent
- [ ] Task role
- [ ] headless

## Isolation

- [ ] CN / Intl AuthStorage 独立
- [ ] CN / Intl scope 独立
- [ ] CN / Intl settings 独立
- [ ] CN logout 不影响 Intl
- [ ] Intl logout 不影响 CN
- [ ] CN token 无法用于 Intl
- [ ] Intl token 无法用于 CN

## Optional

- [ ] CN Credits

Credits 不通过不应阻塞：

```text
CN Chat Provider
```

正式发布。

---

# 19. 文档更新

正式支持 CN 后建议更新：

```text
README.md
docs/omp-port/release-evidence.md
```

---

## README 增加

### Supported Realms

```text
WorkBuddy International
WorkBuddy China
```

### Login

```text
/login workbuddy
/login workbuddy-cn
```

### Commands

```text
/workbuddy
/workbuddy-cn
```

### Model Cache

分别说明：

```text
Intl cache
CN cache
```

### Limitations

明确：

```text
两个 Provider 独立登录
不自动路由
不跨 realm fallback
每个 Provider 单账号
```

---

# 20. 推荐 Commit / PR 顺序

## PR1

```text
refactor: parameterize WorkBuddy site configuration
```

建议 Commit：

```text
refactor: add WorkBuddy site descriptor

refactor: make OAuth API site-aware

refactor: make provider configuration site-aware

refactor: make model and settings paths site-aware

test: run existing contracts through intl site config
```

---

## PR2

```text
feat: add WorkBuddy China provider
```

建议 Commit：

```text
feat: define WorkBuddy China site

feat: register workbuddy-cn provider

feat: isolate CN model scope and settings

test: cover cross-realm credential isolation

test: cover CN provider headers and lifecycle

docs: document WorkBuddy China RC usage
```

---

## PR3

```text
test: validate WorkBuddy China live gateway
```

建议内容：

```text
CN OAuth evidence
CN Refresh evidence
CN Chat evidence
CN Tools evidence
CN Vision evidence
CN Reasoning evidence
CN main / Task evidence
CN headless evidence
```

如 Billing 验证通过：

```text
feat: enable WorkBuddy China usage reporting
```

否则不加。

---

# 21. 停止规则

开发过程中如果遇到以下情况，不继续堆 workaround。

## OAuth

如果真实 CN OAuth：

```text
与 Intl 完全不同
```

先记录协议，再重新评估。

不要直接在：

```text
auth.ts
```

加入大量：

```ts
if cn ...
else intl ...
```

---

## Models

如果国内 Desktop cache schema 与 Intl 明显不同：

优先：

```text
增加一个小 parser adapter
```

而不是污染当前：

```text
parseProductModel()
```

但只有出现真实 schema 分叉后才做。

---

## Chat

如果 CN Gateway 需要额外 payload rewrite：

必须先获得：

```text
可重复 4xx
最小失败 payload
最小成功 payload
```

然后只实现最小 diff。

---

# 22. 设计原则总结

本次开发保持以下原则。

## 原则 1

```text
不同 credential realm
→ 不同 Provider ID
```

## 原则 2

```text
协议相同
→ 共用实现
```

## 原则 3

```text
站点不同
→ 配置数据化
```

## 原则 4

```text
没有真实证据
→ 不增加兼容逻辑
```

## 原则 5

```text
没有现实需求
→ 不增加抽象层
```

## 原则 6

```text
管理面失败
≠
Chat plane 失败
```

## 原则 7

```text
CN / Intl 永不隐式 fallback
```

---

# 23. 最终目标状态

完成后代码结构仍保持：

```text
extensions/
└── workbuddy.ts

src/
├── site.ts
├── auth.ts
├── credits.ts
├── models.ts
├── payload.ts
├── provider.ts
├── settings.ts
├── ui.ts
└── workbuddy-api.ts
```

只新增一个核心生产代码文件：

```text
src/site.ts
```

运行时：

```text
                 ┌─ workbuddy
OMP ─ shared ────┤
                 └─ workbuddy-cn
```

而不是：

```text
Intl implementation
+
CN implementation
```

目标是让未来维护者看到代码后可以简单理解：

> WorkBuddy 国内版和国际版是同一协议族下的两个独立站点与认证域；业务实现共享，credential 与配置隔离。

---

# 24. 开发启动 Checklist

开始编码前：

- [ ] 从当前稳定分支创建 feature branch
- [ ] 保存当前 Intl `npm test` 基线
- [ ] 保存当前 Intl `npm run typecheck` 基线
- [ ] 保存当前 Intl live evidence
- [ ] 创建 `src/site.ts`
- [ ] 只实现 `WORKBUDDY_INTL`
- [ ] 完成 PR1
- [ ] 确认 PR1 无用户可见变化
- [ ] 再开始 CN
- [ ] 获取真实 CN Desktop cache
- [ ] 获取真实 CN OAuth 流程
- [ ] 锁定 CN site 参数
- [ ] 实现 `WORKBUDDY_CN`
- [ ] 增加 cross-realm isolation tests
- [ ] 进行 CN live gate
- [ ] 更新 release evidence
- [ ] 发布 `v1.2.0-rc.1`
- [ ] RC 验证后发布 `v1.2.0`

---

## 最终开发准则

本计划的核心不是“增加中国区代码”，而是：

```text
把现有国际版代码中错误写死的站点参数抽出来，
然后实例化第二个独立、安全、可验证的 WorkBuddy realm。
```

如果一个改动无法用这句话解释，就需要重新判断它是否真的属于本次需求。
