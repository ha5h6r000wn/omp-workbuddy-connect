# OMP WorkBuddy Connect

> **v1.1.8-rc.3 release candidate for OMP 18.2.6**
>
> 正常单账号、串行换号与完整功能回归已通过；并发 credential replacement 的
> Bearer/Header 原子关联是 RC 已知限制。正式证据见 `docs/omp-port/release-evidence.md`。

## 当前版本

WorkBuddy AI 国际版 provider for OMP。当前 RC 保留 v1.1.7 的功能边界，并验证认证、模型目录、scope、Gateway、工具、Credits、main、Task 与 headless 路径。

移植自 [iceloon/dsh-workbuddyai-connect](https://github.com/iceloon/dsh-workbuddyai-connect)（DSH 插件）；当前实现直接注册 OMP provider，不使用 shim 或 loopback 代理。

## 安装

要求 OMP `18.2.6`，并要求外部 Bun 可执行文件在 `$PATH` 中。OMP Plugin Manager 安装或卸载 GitHub 插件时会调用 `bun`；OMP 自身的编译二进制不能替代这个外部命令。macOS 可先执行：

```bash
brew install oven-sh/bun/bun
bun --version
```

其他系统按 [Bun 官方安装说明](https://bun.sh/docs/installation) 安装，并确认 `bun --version` 可运行。稳定版仍可固定安装 `v1.1.7`；测试当前 RC 使用：

```bash
omp plugin install github:ha5h6r000wn/omp-workbuddy-connect#v1.1.8-rc.3
omp
```

如果安装时报 `Executable not found in $PATH: "bun"`，说明 Bun 尚未安装或当前 shell 找不到它。使用 Bun 官方安装脚本时，通常还需要重新打开终端，或执行：

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

进入 OMP 后先执行 `/login workbuddy`；如果默认 `free` 范围为空，执行 `/workbuddy all`，再用 `/model` 选择 WorkBuddy 模型。插件默认安装到 user scope，可供不同项目中的默认 OMP 环境使用。named profile 是独立环境，不会自动继承默认环境的插件或凭据；`--profile workbuddy` 仅适合隔离测试，不是普通用户的正式安装步骤。

当前不通过 npm registry 或 OMP Marketplace 分发，也不要从未固定的 `main` 分支安装。开发者从本地 checkout 调试时使用：

```bash
omp plugin link /absolute/path/to/omp-workbuddy-connect
```

卸载 GitHub 安装：

```bash
omp plugin uninstall omp-workbuddy-connect
```

## 登录

设置 → 模型 → WorkBuddy AI → **Connect**（弹出浏览器登录页），或：

```
/login workbuddy
```

正式凭据仅由 OMP AuthStorage 持久化和刷新。`.workbuddy-auth.json`、Desktop credential 与 `WORKBUDDY_AUTH_FILE` 不参与登录或请求回退；使用 `/login workbuddy` 登录。

## 模型与推理档

默认 scope 为 `free`。只有有效 Desktop 产品目录中带明确零 multiplier credits 证据的模型会显示；`0`、`0.0`、`x0`、`x0.00` 等规范零值会归一为免费证据，非零、缺失或格式错误均不是免费。有效缓存（包括 `models: []`）是权威结果，不会被内置列表扩宽。内置清单仅作为整个目录不可用或无任何有效行时的 fallback，不构成免费证据，因此 fallback 来源的 `free` 可以为空。

每个模型的 reasoning、图片能力和推理档来自产品配置 `~/.workbuddy-ai/cache/acc-product-config-v3.json`。`/workbuddy` 详情显示精确来源 `desktop-cache` 或 `builtin-fallback`；fallback 同时显示缺失、不可读、JSON 无效、结构无效或无有效模型的原因。缓存不可用时，`all` scope 可使用当前内置目录：

| 模型 | 上下文 / 有效输出上限 | OMP canonical effort |
| --- | --- | --- |
| Deepseek-V4.1-Flash | 1M / 16k | low · medium · high · xhigh · max |
| Hy4 preview | 1M / 64k | high |
| Hy3 | 192k / 64k | low · high |

推理配置使用 OMP canonical `thinking: { mode: "effort", efforts, requiresEffort }`。未声明可信 `supportedEfforts` 或 off 能力时，只保留 `reasoning` capability，不自动扩展 effort；`canDisableThinking=false` 会禁止 off。发布验收覆盖声明支持的高推理档，插件不会预设未经产品目录证明的 `none` 或其他 wire 值。

## 设置

管理面完全可选；Billing、Widget 或 TUI 故障不会阻塞登录、Chat 或工具调用。

- **默认界面** — 不挂载 WorkBuddy Widget，也不占用 OMP status line；`session_start` / `turn_start` 不主动查询 Billing。
- **`/workbuddy`** — 强制刷新并临时显示紧凑详情：脱敏账号、积分/套餐、scope/模型数/目录来源和 Provider 状态。模型名单最多显示前四项及剩余数量；完整选择使用 `/model`。下一次 `turn_start` 自动清除，不使用计时器。
- **`/workbuddy free`** — 切到有明确免费证据的模型范围，以一次性通知报告结果；不查询 Billing，也不挂载常驻详情。
- **`/workbuddy all`** — 切到当前插件可识别的全部模型，以一次性通知报告结果；不查询 Billing，也不挂载常驻详情。
- **`/workbuddy logout`** — 失效异步 UI、删除 OMP WorkBuddy credential，并清除 Widget/status。

积分明确区分查询中、可用（含真实 0）和不可用；失败后不沿用 last-good 值。scope 存于 OMP agent 目录的 `.workbuddy-settings.json`；默认目录与 profile 均由 OMP 决定，`PI_CODING_AGENT_DIR` 可覆盖。Headless 模式不会调用 select/notify/widget/status。

非空范围切换直接重注册 Provider，让 OMP 原位替换 runtime overlay；只有权威空目录才先注销旧 Provider，以清除 OMP 18.2.6 不会被 `models: []` 覆盖的陈旧行。随后保存非敏感 scope，最后提交内存状态。注册或设置写入失败会恢复旧目录且不报告成功；当前模型被移出范围时插件提示重选，并在选择范围内模型前阻断 retained Model 请求，不自动选择付费模型或 fallback。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `WORKBUDDYAI_PRODUCT_CONFIG` | 指定产品配置 JSON 路径 |
| `PI_CODING_AGENT_DIR` | 覆盖 OMP agent 目录；非敏感 scope 设置文件随宿主目录规则存放 |

## 验证

```bash
npm test
npm run typecheck
```

`npm test` 顺序执行 19 个永久回归脚本，避免全局 fetch、AuthStorage 与 runtime fixture 并发互扰。真实 OAuth、Chat、Refresh、Vision、Tools、Credits、main、Task role 与 headless 的发布证据不由 Mock 替代，记录于 `docs/omp-port/release-evidence.md`。

## 与上游的差异

- 直接 `pi.registerProvider`，去掉 DSH 的 shim 与 loopback 端口转发。
- 内置模型仅作为产品目录不可用时的 fallback，不是免费模型证明。
- 推理档由 OMP canonical `thinking` metadata 驱动；宿主根据 `efforts`、`requiresEffort` 和 Gateway compat 生成 `reasoning_effort`。
- 选 Default（auto）时不主动选择 effort；选择具体档位、required off 和 optional off 均由 OMP transport 根据模型 metadata 处理。
- Deepseek-V4.1-Flash 的目录与请求有效输出上限均为 16k（`FLASH_MAX_TOKENS`）：已记录的 Gateway 行为显示更大预算可能陷入重复推理循环。产品目录原始 `maxOutputTokens` 可以更高，但不会作为实际请求上限公开。
- 插件当前不清理 assistant reasoning/history；OMP 原生 history 与 tool association 保持不变。只有真实 WorkBuddy Gateway 拒绝证据可复现时，才增加最小兼容转换。
- WorkBuddy Gateway 的 `tool_choice` 只接受字符串；插件仅把 OMP 原生 named-choice 对象复制为函数名字符串。该差异来自隔离 live gate 的可复现 `400` / code `11101`，其他 tool/prompt/history 字段不改写。
- 不按模型名称猜测 reasoning effort，也不为缺少可信能力信息的模型生成全档默认。

## 迁移

- 不复用旧 Pi/Fork、DSH 或 Desktop credential；安装后必须执行 `/login workbuddy`。
- `.workbuddy-auth.json`、`WORKBUDDY_AUTH_FILE` 与 Desktop credential 没有优先级，也不是回退源。
- 旧 scope 设置不会导入；用 `/workbuddy free` 或 `/workbuddy all` 明确选择。
- 当前 RC 包版本为 `1.1.8-rc.3`；稳定版仍为 `v1.1.7`。

## v1 限制

- 仅验证官方 OMP `18.2.6` 与 WorkBuddy 国际版 `https://www.workbuddy.ai`。
- 仅支持一个已存储 WorkBuddy Account；零个或多个账号、缺失身份或身份错配均拒绝。
- RC 支持稳定单账号和串行换号。换号前必须完成或取消在途 WorkBuddy 请求，再依次执行 `/workbuddy logout` 与 `/login workbuddy`。
- OMP 18.2.6 不向 `Model.resolveHeaders()` 暴露当前 request-attempt 已选中的 OAuth identity；其他 session/process 在 Bearer 与 Header 构造窗口内并发替换 credential 时，插件不能原子证明两者属于同一 durable row。
- WorkBuddy 不提供常驻 Widget/status；运行 `/workbuddy` 可临时查看详情，下一次 `turn_start` 自动收起。
- 模型目录只读 `~/.workbuddy-ai/cache/acc-product-config-v3.json` 的产品元数据；不读取 Desktop credential。缓存失效时 `all` 使用内置 fallback，`free` 不把 fallback 或缺少 multiplier 的模型猜成免费。
- 同 ID 的其他 Provider 不经过 WorkBuddy payload 或身份逻辑。v1 不包含多账号轮换、Desktop credential import、自定义 Chat transport、在线动态目录端点或即时 model-select UI。
- OMP 18.2.6 的 Usage API 是跨 Provider 聚合刷新；`/workbuddy` 只展示 WorkBuddy 报告，但刷新缓存时宿主可能同时查询其他已配置 Provider。

## License

MIT
