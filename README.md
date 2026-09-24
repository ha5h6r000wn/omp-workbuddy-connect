# OMP WorkBuddy Connect

> **当前源码为 v1.2.0-rc.3，针对 OMP 18.3.0 的 AuthStorage 命名空间接口；定向验收已批准 RC 发布门槛，但 tag 尚未创建或推送。**
>
> 已发布的 v1.2.0-rc.2 基于 OMP 18.2.7。18.3.0 上完成了隔离 profile 的双站 fresh OAuth、Chat、跨进程重启、强制刷新、真实中国站 Task、同时发起的双站 Chat 及按 realm 退出；额外 10 轮双站并发探针（20 次 Chat）均在 30 秒内完成。此前默认 profile 的一次无阶段并发探针超过 110 秒，原因仍未查明；10 轮成功仅支持 **RC 剩余风险接受**，不代表该异常已修复或故障率有保证。受影响矩阵、旧版能力的证据边界及发布决定见 `openspec/changes/upgrade-omp-18-3-auth-storage/evidence.md` 和 `docs/omp-port/release-evidence.md`。

## 当前版本

同时提供 WorkBuddy AI 国际站 `workbuddy` 与中国站 `workbuddy-cn` Provider。两个 realm 独立登录、独立持久化 credential、独立 scope/settings，不自动判断地区、不复用账号，也不跨 realm fallback。

移植自 [iceloon/dsh-workbuddyai-connect](https://github.com/iceloon/dsh-workbuddyai-connect)（DSH 插件）；当前实现直接注册 OMP provider，不使用 shim 或 loopback 代理。

## 安装

要求 OMP `18.3.0` 与外部 Bun 可执行文件位于 `$PATH`。OMP Plugin Manager 安装或卸载 GitHub 插件时会调用 `bun`；OMP 自身的编译二进制不能替代这个外部命令。macOS 可先执行：

```bash
brew install oven-sh/bun/bun
bun --version
```

其他系统按 [Bun 官方安装说明](https://bun.sh/docs/installation) 安装，并确认 `bun --version` 可运行。`v1.2.0-rc.3` 发布后可固定安装：

```bash
omp plugin install github:ha5h6r000wn/omp-workbuddy-connect#v1.2.0-rc.3
omp
```

如果安装时报 `Executable not found in $PATH: "bun"`，说明 Bun 尚未安装或当前 shell 找不到它。使用 Bun 官方安装脚本时，通常还需要重新打开终端，或执行：

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

进入 OMP 后按需执行 `/login workbuddy`（国际站）或 `/login workbuddy-cn`（中国站）。如果目标 realm 的默认 `free` 范围为空，执行 `/workbuddy all` 或 `/workbuddy-cn all`，再用 `/model` 选择对应 Provider 模型。两个 realm 必须分别登录；一个站点的凭据不会自动授权另一个站点。插件默认安装到 user scope，可供不同项目中的默认 OMP 环境使用。named profile 是独立环境，不会自动继承默认环境的插件或凭据；`--profile workbuddy` 仅适合隔离测试，不是普通用户的正式安装步骤。

当前不通过 npm registry 或 OMP Marketplace 分发，也不要从未固定的 `main` 分支安装。开发者从本地 checkout 调试时使用：

```bash
omp plugin link /absolute/path/to/omp-workbuddy-connect
```

卸载 GitHub 安装：

```bash
omp plugin uninstall omp-workbuddy-connect
```

## 登录

设置 → 模型 → 选择目标 WorkBuddy Provider → **Connect**（弹出对应官方浏览器登录页），或：

```text
/login workbuddy
/login workbuddy-cn
```

`workbuddy` 使用国际站 `https://www.workbuddy.ai`；`workbuddy-cn` 使用中国站 `https://copilot.tencent.com`。正式凭据仅由各自的 OMP AuthStorage namespace 持久化和刷新。两个 realm 每个仅支持一个账号；`.workbuddy-auth.json`、Desktop credential 与 `WORKBUDDY_AUTH_FILE` 不参与登录或请求回退。

## 模型与推理档

每个 realm 默认 scope 均为 `free`。只有对应 Desktop 产品目录中带明确零 multiplier credits 证据的模型会显示；`0`、`0.0`、`x0`、`x0.00` 等规范零值会归一为免费证据，非零、缺失或格式错误均不是免费。有效缓存（包括 `models: []`）是权威结果，不会被另一 realm 扩宽。
模型名称仅在目录 multiplier 语法可识别时追加 ` · <multiplier>`；缺失、空白、`x?`、格式错误以及没有价格证据的内置 fallback 均只显示裸模型名，避免把占位值误呈现为价格。

国际站读取 `~/.workbuddy-ai/cache/acc-product-config-v3.json`；缓存整体不可用时，`all` 可使用维护的国际站内置目录，但 fallback 不构成免费证据。中国站仅读取 `~/.workbuddy/cache/acc-product-config-v3.json`，没有跨站或内置 fallback；缓存缺失、损坏或没有有效模型时明确显示 unavailable/empty。reasoning、图片能力和推理档均来自目标 realm 的目录。

| 国际站内置 fallback 模型 | 上下文 / 有效输出上限 | OMP canonical effort |
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
- **`/workbuddy-cn`** — 显示中国站脱敏账号、scope/模型数、目录来源和 Provider 状态。中国站 Usage/Billing 尚未批准，因此“积分 不可用 / 套餐 不可用”是设计行为，不是登录或 Chat 故障。
- **`/workbuddy-cn free|all|logout`** — 仅切换或删除中国站状态，不修改国际站 credential、scope 或 UI。

积分明确区分查询中、可用（含真实 0）和不可用；失败后不沿用 last-good 值。scope 分别存于 OMP agent 目录的 `.workbuddy-settings.json` 与 `.workbuddy-cn-settings.json`；默认目录与 profile 均由 OMP 决定，`PI_CODING_AGENT_DIR` 可覆盖。Headless 模式不会调用 select/notify/widget/status。

非空范围切换直接重注册 Provider，让 OMP 原位替换 runtime overlay；只有权威空目录才先注销旧 Provider，以清除当前 OMP 不会被 `models: []` 覆盖的陈旧行。随后保存非敏感 scope，最后提交内存状态。注册或设置写入失败会恢复旧目录且不报告成功；当前模型被移出范围时插件提示重选，并在选择范围内模型前阻断 retained Model 请求，不自动选择付费模型或 fallback。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `WORKBUDDYAI_PRODUCT_CONFIG` | 指定产品配置 JSON 路径 |
| `WORKBUDDY_CN_PRODUCT_CONFIG` | 指定中国站产品配置 JSON 路径 |
| `PI_CODING_AGENT_DIR` | 覆盖 OMP agent 目录；非敏感 scope 设置文件随宿主目录规则存放 |

## 验证

```bash
npm test
npm run test:fast
npm run typecheck
```

`npm test` 是发布权威入口：顺序执行 20 个永久回归脚本，每个脚本使用独立 Bun 进程，避免全局 fetch、AuthStorage、runtime fixture 和计时敏感场景互相争用。`npm run test:fast` 是开发期实验入口：默认 worker 数为本机可用并行度与 4 的较小值，并发运行已分类的普通脚本，再串行运行 OAuth、Billing timeout、session-start、native transport 和真实 Task subprocess 场景；可用 `WORKBUDDY_TEST_CONCURRENCY=<n>` 显式覆盖并发度。fast 结果不能替代 RC 的串行 `npm test`。真实双 realm OAuth、Chat、Refresh、Vision、Tools、国际站 Billing、main、Task runtime 与 headless 的发布证据不由 Mock 替代，记录于 `docs/omp-port/release-evidence.md`。

## 与上游的差异

- 直接 `pi.registerProvider`，去掉 DSH 的 shim 与 loopback 端口转发。
- 仅国际站维护内置模型，且只在国际站产品目录整体不可用时作为 `all` fallback；它不是免费模型证明。中国站没有内置或跨站 fallback。
- 推理档由 OMP canonical `thinking` metadata 驱动；宿主根据 `efforts`、`requiresEffort` 和 Gateway compat 生成 `reasoning_effort`。
- 选 Default（auto）时不主动选择 effort；选择具体档位、required off 和 optional off 均由 OMP transport 根据模型 metadata 处理。
- 国际站 Deepseek-V4.1-Flash 的目录与请求有效输出上限均钳制为 16k（`FLASH_MAX_TOKENS`）：已记录的 Gateway 行为显示更大预算可能陷入重复推理循环。该 override 不作用于中国站同名模型。
- 插件当前不清理 assistant reasoning/history；OMP 原生 history 与 tool association 保持不变。只有真实 WorkBuddy Gateway 拒绝证据可复现时，才增加最小兼容转换。
- 国际站 Gateway 的 `tool_choice` 只接受字符串；插件仅对 `workbuddy` 把 OMP 原生 named-choice 对象复制为函数名字符串。该差异来自隔离 live gate 的可复现 `400` / code `11101`；`workbuddy-cn` 及其他 tool/prompt/history 字段不改写。
- 不按模型名称猜测 reasoning effort，也不为缺少可信能力信息的模型生成全档默认。

## 迁移

- 不复用旧 Pi/Fork、DSH 或 Desktop credential；按目标 realm 分别执行 `/login workbuddy` 或 `/login workbuddy-cn`。
- `.workbuddy-auth.json`、`WORKBUDDY_AUTH_FILE` 与 Desktop credential 没有优先级，也不是回退源；既有国际站 credential 仍只属于 `workbuddy`。
- 旧 scope 设置不会跨 realm 导入；分别用 `/workbuddy free|all` 与 `/workbuddy-cn free|all` 明确选择。
- 当前源码版本为 `v1.2.0-rc.3`（尚未发布）；最新已发布双 realm RC 为 `v1.2.0-rc.2`，稳定版仍为 `v1.1.7`。

## v1 限制

- 每次发布只验收当时最新稳定版官方 OMP；`v1.2.0-rc.1` 的真实功能矩阵验收基于 OMP `18.2.7`、国际站 `https://www.workbuddy.ai` 与中国站 `https://copilot.tencent.com`；当前源码针对 OMP `18.3.0`。
- 每个 realm 仅支持一个已存储账号；零个或多个账号、缺失身份或身份错配均拒绝。中国站 live matrix 使用 personal/no-enterprise 账号，不扩大为企业账号完整验证。
- RC 支持稳定单账号和串行换号。换号前必须完成或 Ctrl-C 取消目标 realm 的在途请求，再执行 `/workbuddy logout` + `/login workbuddy`，或 `/workbuddy-cn logout` + `/login workbuddy-cn`。
- 当前验证的 OMP 不向 `Model.resolveHeaders()` 暴露当前 request-attempt 已选中的 OAuth identity；其他 session/process 在 Bearer 与 Header 构造窗口内并发替换 credential 时，插件不能原子证明两者属于同一 durable row。
- 两个 realm 均不提供常驻 Widget/status；运行对应管理命令可临时查看详情，下一次 `turn_start` 自动收起。
- 中国站 Usage/Billing 未批准并保持 disabled；Chat、reasoning、tools、vision 不依赖 Billing。目录可见只表示结构合格，不保证测试账号实时获准调用；M3 中 MiniMax-M2.5 即由官方 Gateway 返回不可用。
- 同 ID 的其他 Provider 不经过 WorkBuddy payload 或身份逻辑。本 RC 不包含多账号轮换、自动地区探测、跨站 fallback、Desktop credential import、自定义 Chat transport、在线动态目录端点或即时 model-select UI。
- **OMP 本地诊断限制：** OMP `18.2.7` 的真实 HTTP 400/413 验收发现，宿主本地 `~/.omp/logs/http-400-requests/` 附件可能保留动态 `X-User-Id` 账号标识。`18.3.0` 的宿主脱敏源码仍只按含 `key|token|secret|auth|credential|cookie` 的 Header 名称移除值，不匹配 `X-User-Id`；本次未重新制造 400/413 附件，因此继续按可能保留账号标识处理。named profile 使用对应 profile 日志目录；本扩展不上传或擅自删除宿主日志。请将附件作为私有账号数据保管或手动删除。
- 当前 OMP Usage API 是跨 Provider 聚合刷新；`/workbuddy` 只展示国际站报告，但刷新缓存时宿主可能同时查询其他已配置 Provider。

## License

MIT
