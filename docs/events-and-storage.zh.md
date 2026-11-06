# 事件、设置与存储

[安装与快速开始](../README.zh.md) · [English](events-and-storage.md)

## 功能

### 八类事件完全独立（主 agent）

每类事件**各自配置声音与音量**（0–100%）：

| 事件 | 检测来源（DSH 0.2.x 客户端事件面） | 默认声音 |
|---|---|---|
| 回答完成 | 已保留会话的 `turn/end` 且 `reason.kind === 'completed'`；其他会话看列表行 `running` 由 true 变 false | 风铃 |
| 排队续跑 | 同上，且 agent 的 `inbox` 投影里仍有**人类**排队消息（`next-turn` / `next-step`） | 叮咚 |
| 用户停止 | `turn/end` 且 `reason.kind === 'aborted'`（`user` / `parent` / `disposed` / `legacy`） | 静音 |
| 审批请求 | `uiSession.sessionStatus` 的 `pendingInteraction.kind === 'approval'` | 叮咚 |
| 用户提问 | `pendingInteraction.kind === 'question'` | 叮咚 |
| 计划评审 | `pendingInteraction.kind === 'plan-review'` | 叮咚 |
| 目标受阻 | 列表行 goal 投影的 `phase` 进入 `blocked` | 叮咚 |
| 失败 | `turn/end` 的 `error` / `interrupted` / `aborted(hook)`；`api-session/error` | 铃铛 |

- **完成事件**受「当前会话不响铃」限制（按列表行 `retainedBy.mainView` 判定当前会话）；
  **注意事件**（审批/提问/计划评审/目标受阻/失败）始终响铃。
- **排队续跑**用来区分「回合边界」和「真的做完了」：`completed` 时如果 `inbox` 投影里还有
  人类输入，宿主会在 `turn/end` 之后立刻开下一回合（`agent-loop` 的
  `if (!this.inbox.hasPending) return false`），所以这时不再用完成音，改播单独的「排队续跑」
  音（`queuedSound` / `queuedVolume`，默认叮咚）。只认人类输入（`source.kind === 'user'`），
  目标续跑 / 子代理回填等系统消息不算；`error` / `aborted` 等其它结束原因不受影响，
  失败音与用户停止音照旧。队列状态按 `agent/inbox/spliced` 事件（与 `turn/end` 同一条有序
  日志）维护，并用 `Session.projections` 的 `inbox` 投影建基线。
- **用户停止**不再借用失败音：它是独立事件，默认静音；想听提示可单独给它配声音。
  `blocked` / `max-tokens` / `forked` 不响。内部 `parent` / `disposed` 取消使用可配置的停止音，默认静音。
- 需要人介入的状态来自 `uiSession.sessionStatus` 的 `pendingInteraction`，以请求 `key`
  判定「新请求」：刷新恢复、重连回放同一请求都不重复响，回答后新请求照常响。
- 回合结束原因只对**已保留（打开着）的会话**可见（`SessionBinding.eventSource` 的
  `turn/end`）；后台未打开的会话只有 `running` 事实可用，按完成处理。这是 DSH 0.2.x
  取消全局会话事件流之后的平台边界。
- 0.2.x 已无 `session/jobs` 帧：一次性子代理任务改由其**子会话**的 `running` / `turn/end`
  归入子代理通道。
- **多标签页**：同时打开多个标签页时同一次事件只响一声（BroadcastChannel 决胜）；
  单标签页立即播放，不做 40ms 握手。

### 子代理事件独立通道

子代理来源的事件与主 agent 分开检测、独立控制：

- **子代理会话** — 会话行明确带 `origin: 'subagent'` 的事件，
  包括子会话回合结束、用户停止、审批、提问、计划评审、目标受阻与失败。
  父会话 ID 只表示血缘，不代表子代理身份：普通 fork 会话仍走主 agent 通道，
  不受子代理静音或「忽略子代理事件」设置影响。

设置面板新增**子代理事件**分区：七个事件行（声音来源与音量控件与主事件一致），
外加一个「忽略子代理事件」总开关。子代理完成与停止默认静音，其余事件可单独配置，
主 agent 事件行为不变。「排队续跑」只属于人类输入，没有子代理行——子代理会话里的排队
来自父代理而不是人。

### 声音来源

设置面板里每类事件用 **Radio.Group + Radio.Button** 选择声音：

- **内置合成音** — 叮咚 / 风铃 / 铃铛 / 完成 / 成功，Web Audio 实时合成，无需音频文件；
- **静音** — 该事件不响；
- **本地文件** — 选择任意 MP3/WAV 等文件；选中后**该事件行下方会出现文件选择**。
  上传文件存入 IndexedDB（`dsh-sound-audio`），不受 localStorage 容量限制。

### 设置面板（设置 → 声音通知）

总开关与配置导入/导出保持常驻；**主 Agent / 子代理** 两个 Tab 切换面板：
主 Tab 是八类主事件行，子代理 Tab 是七类子代理事件行加「忽略子代理事件」开关。
每个事件行标题行右侧为音量滑块，下方为 Radio.Button 分段选择（点击即选中并播放）；
选「本地文件」时行下方出现选择/更换按钮与文件名。

## 配置持久化

- 客户端配置保存在浏览器 **localStorage**（键 `dsh-sound:config`），读取时做字段校验与默认值兜底。
  上传的本地音乐存入 **IndexedDB**（`dsh-sound-audio`），不受 localStorage 容量限制。
- 配置键：`enabled`、`quietCurrent`、`ignoreSubagent`，以及八个主声音 + 八个主音量字段——
  `completionSound` / `queuedSound` / `stoppedSound` / `approvalSound` / `questionSound` /
  `planReviewSound` / `goalBlockedSound` / `failureSound`（内置键 / `none` / `local` /
  `data:` URL / `audio:<id>`）与 `completionVolume` … `failureVolume`（0–1，含
  `queuedVolume`）；子代理通道另有对应的 `subagentCompletionSound` …
  `subagentFailureSound` 与 `subagentCompletionVolume` … `subagentFailureVolume`
  （七个事件，完成与停止默认 `none`；没有 `subagentQueued*`）。
  `localFiles` 记住每类事件（`completion` … 与 `subagent-completion` …）上次选的
  本地文件，切到内置音再切回时不丢。
- **旧配置自动迁移**：0.2.0 的 `defaultSound` 迁为 `completionSound`；0.4.x 配置缺少的
  `stoppedSound` / `stoppedVolume` 等新字段按默认值补齐（用户停止 = 静音）。其余旧字段
  （`attentionSound`、`workspaces`、`debounceMs`、全局 `volume`、语音设置）一律忽略，
  voice/TTS 值降级为该类默认音。
- **导出 / 导入**：设置面板可把完整配置下载为 JSON（IndexedDB 音频引用内嵌为 data URL），
  也可从 JSON 文件恢复——换浏览器 / 换设备无需重新配置。
- 宿主端导出 `Config`，由 Loader 发现配置 schema。浏览器声音偏好仍保存于
  localStorage，不需要额外调用 settings 服务注册。

## 兼容性与能力披露

**兼容范围**

- Node.js `>=20`；包兼容声明仍以 `package.json` 为准。
- DSH `0.2.2-rc.1` 已做源码合同核对和自动化验证，不代表真实 Desktop 中逐事件声音验收。开放 peer 范围及旧 manifest 声明不代表验证过所有宿主版本。

**依赖**

- 宿主端:仅 `@deepseek-ai/schemastery`(设置 schema)与 peer 依赖 `@deepseek-ai/cordis`,
  无其他运行时依赖。
- 客户端:React 由宿主应用通过客户端模块表提供,包内不携带副本;客户端半体只使用宿主
  已暴露的服务(`sessions` / `locale` / `slots`,以及可选的 `uiSession` / `remote`)。

**能力与权限**

- 本地文件:设置面板打开浏览器自带的文件选择器,读取用户主动选择的音频文件,
  存入 IndexedDB(`dsh-sound-audio`);没有浏览器沙箱之外的文件系统访问,也不会自动扫描文件。
- 存储:配置存 `localStorage`(`dsh-sound:config`),音频存 IndexedDB。
- 无网络请求、无外部服务、无 shell/命令执行、无凭据、无原生制品,
  也没有安装期生命周期脚本(`preinstall` / `install` / `postinstall` / `prepare` 均不存在)。

**失败边界**

- 播放失败(浏览器自动播放策略、音频不支持)静默降级,界面不受影响。
- IndexedDB/localStorage 不可用时退化为内存配置;读不到的音频引用直接忽略。
- 事件流不可用或帧解析失败时降级为会话快照 diff;畸形帧被忽略且不崩溃。
- 每次读取配置都会按已知字段与默认值做清洗。
