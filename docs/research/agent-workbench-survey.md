# 同类项目调研：hapi、Orca、herdr、CloudCLI、Tern

调研日期 2026-11-10，对照的 Kiteline 版本为 `main` 的 `bab5bcd`。本文回答一个问题：这五个项目里，哪些特性值得 Kiteline 吸收，前提是 Kiteline 不包装任何 harness，只通过终端提供 agent CLI 体验。

| 项目                                                              | 调研版本                      | 许可                    | 一句话定位                                                                   |
| ----------------------------------------------------------------- | ----------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| [tiann/hapi](https://github.com/tiann/hapi)                       | `961f2fd`（2026-11-10）       | AGPL-3.0                | 用手机和网页远程驱动官方 coding agent，卖点是一键审批、推送、终端与手机接续  |
| [stablyai/orca](https://github.com/stablyai/orca)                 | `8a10dd37`，1.4.214           | MIT                     | Electron 桌面 IDE，每个任务一个 git worktree，并行运行多种 agent             |
| [herdrdev/herdr](https://github.com/herdrdev/herdr)               | `ee5bfb5`，0.9.5              | Apache-2.0              | Rust 写的终端复用器，在 tmux 式模型上加 agent 识别、状态汇总、通知和编排 CLI |
| [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui) | `4e20c29`，1.37.8（CloudCLI） | AGPL-3.0                | 包装 Claude Code、Codex、Cursor 等，自绘聊天界面，附带终端、文件和 Git 面板  |
| [Tern](https://stencil.so/tern)                                   | 闭测中，社区引用到 0.8.x      | 闭源（插件 SDK 为 MIT） | Rust 原生终端，会话由守护进程持有，桌面、iOS、浏览器同时接入                 |

hapi 和 CloudCLI 是 AGPL，与 Kiteline 的 Apache-2.0 不兼容，只能借鉴思路，不能搬代码。

## 结论

Kiteline 在“拿到 agent 状态”这件事上已经走在最省力的路上，差距在拿到状态之后怎么用。五个项目里有四个为了知道 agent 在干什么，付出了很重的耦合成本：改写 harness 配置安装 hooks、解析会话 JSONL、接 SDK、维护按屏幕文字匹配的规则。而 Claude Code 和 Codex 现在都会主动发 OSC 7501，Kiteline 已经在解析它。所以这次调研不建议 Kiteline 增加任何状态推断手段，建议把投入放在下面几件事上，按价值排序：

1. **人不在页面时也能收到提醒。** 系统通知、声音、标题计数，再到 Web Push 和通用 webhook。五个项目都做了，Kiteline 目前只有侧栏角标。
2. **跨工作区的“需要我”队列，以及跳到下一个等待中的终端。** herdr、Orca、Tern 都把它作为主入口。
3. **在通知里看着屏幕直接回键。** 这是对 hapi 和 CloudCLI“一键审批”的纯终端替代，Kiteline 已有的条件输入正好够用。
4. **给 agent 编排 agent 用的 CLI 原语。** 按程序状态等待、按文本等待、状态条件发送、终端里的会话身份环境变量、设备本机的发送和观察命令。
5. **worktree 的创建、登记和清理。** Kiteline 现在只能发现 worktree。
6. **diff 行评论批量回灌到终端。** Orca 的做法本身就是纯文本粘贴。
7. **agent 升级或重启时保留终端会话。** 价值很高，成本也最高。

其余是一批低成本小项，见[小项清单](#小项清单)。明确不该学的东西见[明确不做](#明确不做)。

## 一个改变优先级的事实：主流 agent 已经发 OSC 7501

Orca 的仓库里维护着一份 OSC 7501 支持矩阵（`orca: src/main/agent-hooks/README.md`，标注最后更新于 2026-10-17，每一行都是在 PTY 里运行真实 CLI 测得）。和 Kiteline 相关的结论：

| Agent               | 发 OSC 7501    | 是否先探测 `OSC 7501;?` | 状态     | blocked 的 kind | 备注                                              |
| ------------------- | -------------- | ----------------------- | -------- | --------------- | ------------------------------------------------- |
| Claude Code         | 是，2.1.295 起 | 必须得到应答才发        | 五种都有 | 三种都有        | `msg` 带任务摘要和待批准内容，子 agent 作为子记录 |
| Codex 0.163         | 是             | 不探测，直接发          | 五种都有 | 不发 kind       | 不带 `msg`                                        |
| Grok、pi、oh-my-pi  | 是             | Grok 和 pi 需要应答     | 五种都有 | 有              |                                                   |
| OpenCode、Cursor 等 | 否             |                         |          |                 | 只能得到 OSC 9/777 通知或什么都没有               |

Kiteline 的私有 tmux 已经固定应答这个探测（`docs/design/terminal.md` 的“程序报告状态”），所以两个主力 agent 的实时状态都能通过公开协议拿到。矩阵还记了一条副作用：终端应答探测之后，Claude Code 不再在窗口标题里输出状态字形。

这份矩阵是 Orca 自己的测试结果，我没有在 Kiteline 里复现。建议在 Kiteline 的终端里实测一遍，并把结果写进使用文档，让用户知道哪些 agent 开箱即有状态。

五个项目获取状态的方式对比如下，可以看出 Kiteline 省掉了什么：

| 项目     | 状态来源                                                                | 代价                                                                                   |
| -------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Kiteline | 程序主动发的 OSC 7501，加 OSC 9/777 通知                                | 不推断，没有报告就是未知                                                               |
| herdr    | 前台进程识别，加每个 agent 一份屏幕规则，加 hook 上报                   | 22 份规则文件，Claude 一份 242 行；62 个版本的更新日志里约 107 行在修检测              |
| Orca     | 改写 harness 配置安装托管 hooks 为主，OSC 7501 兜底，再加标题字形启发式 | 状态和 hook 相关目录合计数万行；整个仓库约 258 万行，Kiteline 的 `packages/` 约 5 万行 |
| hapi     | Claude hooks、会话 JSONL、Agent SDK、Codex app-server、ACP              | 每个 agent 一套集成                                                                    |
| CloudCLI | 各家 SDK，加监听 `~/.claude/projects` 下的 JSONL                        | 更新日志大量条目在追私有格式的变化                                                     |
| Tern     | 对第三方 agent 只看 OSC 9;4 进度序列和进程名                            | 信号不够用，社区又回头去读屏和装 hooks 补                                              |

herdr 的经历最有说服力。它从 0.6.7 起把 Claude Code 和 Codex 的 hook 集成降级为只上报会话身份，状态改回屏幕检测，原因是 hook 状态不可靠：子 agent 的 hook 会把父终端打回 working，权限请求会卡在 working（`herdr: CHANGELOG.md` 的 0.6.7 “Changed”一节）。也就是说，装 hook 这条路连它的主要实践者都退了回来。

有三份子调研是在“Claude Code 和 Codex 不发 OSC 7501”的假设下写的，因此建议了几种补状态的办法：文档指引用户配 hook 脚本输出 OSC、可选的屏幕规则引擎、识别 OSC 9;4。按上面的矩阵，这些办法的必要性都大幅下降，本文没有采纳，理由见[明确不做](#明确不做)和[需要你拍板的取舍](#需要你拍板的取舍)。

## 建议吸收的特性

### 1. 人不在页面时的提醒

**现状。** 报告只显示为侧栏工作区行的角标，页面标题不含计数（`packages/web/src/workbench.tsx`），没有声音，没有系统通知。`packages/web/public/manifest.webmanifest` 已经存在，但没有 Service Worker，也没有推送订阅。agent 跑几分钟到几十分钟，人通常已经切走，这是目前最影响体验的缺口。

**别人怎么做。**

- herdr 的触发规则值得照抄：进入 blocked 时发“需要关注”，从 working 或 blocked 回到 idle 时发“完成”；延迟 1 秒，到期时状态仍成立才发；正在看的终端不发；可按 agent 静音。
- hapi 按页面可见性路由：有可见页面时只在页面内提示，否则才发系统推送；同一会话的通知用同一个 tag 折叠；推送服务返回 410 时删除订阅；权限请求防抖 500 毫秒，完成通知每个会话冷却 5 秒（`hapi: hub/src/push/pushNotificationChannel.ts`、`hub/src/notifications/notificationHub.ts`）。
- CloudCLI 的出站 webhook 只发生命周期元数据，用 HMAC-SHA256 签名，并做了 SSRF 防护：只允许 https，拒绝 link-local 和元数据地址，连接时逐个检查解析出的 IP，不跟随重定向（`claudecodeui: server/modules/notifications/`）。
- hapi 另有 Telegram 和 Server 酱通道，并可设为只在没有可见页面时发送。

**建议做法。** 触发源用现成的 `terminal.notice` 和程序状态摘要，不需要任何新的检测。分三步：

1. 页面在后台时发系统通知，并加提示音、标题里的未读计数和 `navigator.setAppBadge`。页面可见时维持现在的角标，不引入 toast，这和 `docs/design/interaction.md`“没有全局通知队列或 toast”的约定不冲突。点击通知走已有的激活流程。
2. Web Push。server 生成并持久化 VAPID 密钥，新增订阅表；Service Worker 只处理 `push` 和 `notificationclick`。进入终端清除报告时，同步关闭对应的系统通知。
3. 通用 webhook，预设 ntfy、Bark、Server 酱的格式。

**要注意的地方。**

- Android 上的 Chrome 不支持直接 `new Notification()`，必须经 Service Worker 的 `showNotification`。所以第 1 步最好就把 Service Worker 建起来，三步共用。
- Service Worker 不要注册 `fetch` 处理器。开发服务代理的页面与工作台同源（`docs/design/http-access.md` 的“安全边界”），带 `fetch` 处理器的根作用域 Service Worker 会拦截 `/proxy/` 下的请求。
- iOS 要先把工作台添加到主屏幕才能收推送。
- Web Push 的正文是端到端加密的，推送服务看不到内容。但 Chrome 的推送走 FCM，在中国大陆通常不可达，这是做 webhook 通道的主要理由。
- webhook 的正文会离开自托管环境。默认只发设备、工作区、终端名和状态，正文是否带上由用户选择。

成本：第 1 步低，第 2 步中，第 3 步中低。

### 2. 跨工作区的“需要我”队列

**现状。** 状态只汇总到侧栏工作区行，`docs/design/interaction.md` 明确写了“不汇总到设备或手机导航入口”。窄布局下侧栏是抽屉，用户在手机上看不到角标，除非主动拉开。

**别人怎么做。** herdr 把所有 agent 按 blocked、已完成未看、working、idle 的优先级排序，提供“下一个 agent”快捷键和可按状态过滤的跳转选择器（`herdr: src/workspace/aggregate.rs`）。Orca 有 Needs You、Working、Done、Idle 四列的看板，跳转面板打开时冻结顺序，避免条目在手指下跳动。Tern 有一个收件箱，条目深链回对应的终端。

**建议做法。** 复用 `packages/web/src/devices/workspace-status.ts` 的投影，做一个跨设备和工作区的列表，按 blocked、error、done、working 排序；手机导航上加一个带计数的入口；桌面加一个“下一个等待中的终端”快捷键。这需要修订 `interaction.md` 里的那条约定，所以放进了[需要你拍板的取舍](#需要你拍板的取舍)。

成本：低到中，纯前端。

### 3. 在通知详情里看着屏幕回键

**现状。** 报告详情展示报告正文和状态记录，要回应必须进入终端。在手机上，从推送到按下“允许”要经过打开页面、拉开抽屉、点进终端、等画面恢复这几步。

**别人怎么做。** hapi 用 Claude 的 PermissionRequest hook 把原生权限对话框搬到手机上代答，CloudCLI 用 SDK 的 `canUseTool`。两者都是 harness 耦合，但它们证明了“收到通知后两秒内批准”是用户最在意的体验。

**建议做法。** 详情里用 `sessions.snapshot` 显示当前屏幕，下面放一行按键：Enter、Esc、方向键、数字键、y、n，复用手机快捷键面板的实现。发送走 `sessions.send`，带上快照返回的 `ifInput`，条件不符就刷新快照让用户重选。Kiteline 不需要知道对话框里写的是什么，用户看的是真实屏幕，按的是真实按键。Claude Code 的 `msg` 本身已带“approve Write: …”这样的摘要，可以直接作为通知标题。

和第 1 项的 Web Push 配合后，通知点击可以直接落到这个详情页。

成本：中低。风险在于 `ifInput` 只保证没有别的输入插进来，不保证屏幕没变；如果实测发现对话框会在用户犹豫时自己变化，再加一个按屏幕位置比较的条件。

### 4. 给 agent 编排 agent 用的 CLI 原语

**现状。** 远程 CLI 的 `terminal wait` 只有输出安静和输出变化两种模式（`packages/shared/src/protocol/terminal-observation.ts`），“安静”不代表回合结束。终端里没有任何会话身份环境变量（`packages/shared/src/terminal/node.ts` 只删除了 `TMUX`）。设备本机的 `kiteline-agent terminal` 只有 `list`、`new`、`end`，不能发送输入或读屏。远程 CLI 的 `terminal create` 没有 `--shortcut`。

**别人怎么做。**

- herdr 的 `agent prompt --wait`：发出后 5 秒内必须观察到 working 或 blocked，否则返回 `agent_prompt_stalled`；目标已经 blocked 时拒绝发送；另有 `pane wait-output --regex`（`herdr: src/api/wait.rs`）。
- Orca 的 `terminal wait --for tui-idle` 用了约 8 千行启发式代码来判断空闲；它往终端粘贴评论时带状态条件，agent 停在权限提示时拒绝注入。
- herdr 给每个终端注入 `HERDR_PANE_ID` 等变量（`herdr: src/pane.rs`），CLI 用 `--current` 指代当前终端。
- herdr 和 Orca 都随产品发一份给 agent 读的 skill 文件。Orca 的 skill 只是一个桩，让 agent 执行 `orca skills get orca-cli` 取与当前版本匹配的指南；herdr 的 skill 里写了协作安全规则：不抢焦点、只关自己创建的终端、从 JSON 里解析 ID。

**建议做法。**

1. `sessions.wait` 增加按程序状态等待的模式：等到出现 done、blocked、error 中的任意一个，返回触发的记录和当前屏幕。没有任何状态记录时退回 quiet。有 OSC 7501 作为依据，这比 Orca 的启发式干净得多。
2. `terminal wait --match REGEX`，在已解析的屏幕文本上匹配。
3. `sessions.send` 增加状态条件：目标有 blocked 记录时拒绝，避免把提示词打进权限对话框。
4. 创建会话时注入 `KITELINE_WORKSPACE_ID` 和 `KITELINE_SESSION_ID`，CLI 在缺省目标时读取。这些变量会被子进程继承，只能当标识，不能当凭据。
5. 设备本机的 `kiteline-agent terminal` 补上 `send`、`snapshot`、`wait`，走本机 IPC，不需要 server 凭据。这样终端里的 agent 可以直接指挥同一台设备上的其他终端。
6. 远程 CLI 的 `terminal create` 支持 `--shortcut`。
7. 一份给 agent 读的指南，做法和现有的“让 AI CLI 管理定时任务”一致：`kiteline-agent guide` 输出与当前版本匹配的用法和安全规则。Kiteline 只分发文本，不写任何 harness 的配置目录。

不建议做 Orca 那种带任务图、信箱和决策门的编排数据库（约 4.5 万行）。Kiteline 提供原语和指南就够了，编排逻辑留给 agent 自己。

成本：第 1 到 4、6、7 项低，第 5 项低到中。

### 5. worktree 的创建、登记和清理

**现状。** Git 工具能发现工作区内的 linked worktree 并标注，但不能创建和删除；工作区之外的仓库不会被使用。并行跑多个 agent 时，用户要自己在终端里建 worktree，再手工添加为工作区。

**别人怎么做。** Orca 在这方面做得最细（`orca: src/main/git/worktrees/`）：

- 创建在后台进行，先用 `worktree add --detach --no-checkout --lock` 占位，失败可撤销；侧栏显示进度，可取消和重试。
- 把基线写进 `git config --local branch.<分支>.base`，之后的“相对基线的 diff”和增删行数都以它为准。
- 新 worktree 里没有被 gitignore 的文件。Orca 提供三种补法：把指定的已忽略目录软链或克隆过来；`.worktreeinclude` 列出要复制的路径，带 2 GiB 和 5 万条目的预算；一个 setup 脚本，仓库里共享的脚本首次执行要用户确认。
- 删除时先 `git branch -d`，被 Git 拒绝的分支汇总给用户复核；强删用带期望值的 `update-ref -d refs/heads/<分支> <期望的提交>`，分支在此期间被改动就不会删。
- 用户没设置时写入 `push.autoSetupRemote=true`，新分支第一次推送不会失败。

hapi 和 CloudCLI 的版本简单得多：在仓库同级的 `<仓库>-worktrees/` 目录下创建，然后作为项目打开。

**建议做法。** agent 新增创建和删除 worktree 的 RPC，放进 `GitWriteQueue` 串行执行；创建成功后调用 `workspaces.add` 登记为新工作区，并记录它的来源仓库和基线；Git 面板增加“相对基线”的比较来源。忽略文件的复制、setup 脚本可以第二步再做，setup 可以直接复用快捷方式机制开一个终端来跑。

成本中到高。要对齐的现有规则不少：“工作区外的仓库不使用”、“有会话的工作区不能移除”、写操作的结果未确认语义。推送目标的问题见[需要你拍板的取舍](#需要你拍板的取舍)。

### 6. diff 行评论批量回灌到终端

**现状。** diff 的新增行可以点行号跳到文件；文件编辑器有“复制代码行引用”，复制后手动粘贴到终端。没有在 diff 上写评论的入口。

**别人怎么做。** Orca 允许在 diff 的行或行范围上写评论，攒一批后格式化成纯文本，用括号粘贴送进目标终端（`orca: src/shared/diff-comments-format.ts`）。格式是确定的三行：

```text
File: src/foo.ts
Lines: 12-18
User comment: "这里应该复用已有的 parseTarget"
```

它不依赖任何 harness 接口，这正是 Kiteline 的路线。未处理的评论留到下一批；可以选择只粘贴不回车。

**建议做法。** 评论存在页面内存，按工作区保留；“发送评论”把格式化文本放进目标终端的撰写草稿，由用户确认后插入或发送。这是“复制代码行引用”的自然延伸，草稿、插入、发送的机制都已经有了。

成本：中，纯前端。

### 7. agent 升级或重启时保留终端会话

**现状。** agent 正常停止时对每个会话执行 `kill-server`，新启动的 agent 不导入旧会话（`docs/design/terminal.md` 的“存续与结束”）。升级 agent 必须先停止它，所以每次升级都会结束这台设备上的全部 agent 对话。而在 Linux 和 macOS 上 agent 异常退出时，tmux server 其实是活着的，只是没人接管。

**别人怎么做。**

- Tern 的守护进程可以原地升级，shell 保留伪终端、屏幕和滚屏；机器重启后，之前在跑 agent CLI 的终端会在第一个提示符处重新执行原来的命令行。
- Orca 的终端守护进程独立于应用，应用退出、自动更新、崩溃时 agent 都继续运行；滚屏落盘，上限 5 MB。
- herdr 升级时用 `SCM_RIGHTS` 把 PTY 的文件描述符交给新进程。
- hapi 的 runner 用进程号加进程启动时间核验后重新接管子进程，防止进程号被复用。

**建议做法。** Kiteline 不需要这些项目的复杂机制，因为 tmux 已经持有 PTY，缺的只是“别杀”和“能导入”两步：

1. 增加一种保留会话的停止方式，升级流程使用它。
2. agent 启动时扫描运行目录下的 `<会话 ID>/tmux.sock`，核验 socket 属主和 pane 存活，然后走现有的 `sessions.recover` 路径把 recorder 挂回去，并标记 `historyGap`。
3. 会话表里创建时的名称、工作区、滚屏行数要落盘，否则导入后没有身份。

风险集中在三处。随包的 tmux 版本变化时，新客户端可能连不上旧 server，需要先只支持 tmux 版本不变的升级，版本变了就明确告知会话将结束。Windows 上 tmux 在 agent 持有的 Job 里，必然随 agent 退出，这条在 Windows 上做不了。此外它改变了“agent 正常停止会结束全部会话”这条现有不变量。

设备重启后的恢复是另一回事。Tern 和 herdr 靠写死的各家 `--resume` 命令表来续接对话，这是 harness 耦合，不建议做。Kiteline 可以做的是记住会话的名称、工作区和快捷方式，重启后提供一键重建。

成本：高。

## 小项清单

| 小项                                                                                          | 来源                 | Kiteline 现状                                                          | 成本   |
| --------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- | ------ |
| 在使用文档里维护 OSC 7501 支持矩阵，说明哪些 agent 开箱有状态                                 | Orca                 | 文档只说明协议，没有列 agent                                           | 极低   |
| 命令面板（Ctrl+K）：跳转工作区、终端、文件、分支，执行常用动作                                | CloudCLI、Tern、Orca | 没有                                                                   | 中     |
| 终端标签显示前台程序名，用 tmux 的 `pane_current_command`，只显示不推断状态                   | herdr、Tern          | 只显示程序设置的窗口标题                                               | 低     |
| 显示标题前去掉开头的盲文 spinner 字符，避免标题每帧跳动                                       | herdr                | 原样显示                                                               | 低     |
| 在终端区直接粘贴或拖入图片，自动上传并把路径打进终端                                          | Tern 社区            | 只有撰写框支持，终端区的粘贴只取文本                                   | 低     |
| `status run -- 命令`：包住一条长命令，开始时发 working，结束时按退出码发 done 或 error        | hapi 的 `job run`    | 能解析 OSC 7501，但没有给普通脚本用的发送工具                          | 低     |
| 把页面当 `$EDITOR`：终端里的程序调起编辑器时，在工作页打开文件，用户点完成后命令返回          | Tern                 | 没有；多行撰写已覆盖写提示词的场景，这项主要服务提交消息和 rebase 清单 | 中     |
| Git：与任意分支或提交比较                                                                     | CloudCLI、Orca       | 只能比较工作树、暂存区和单个提交                                       | 中     |
| Git：编辑器行号栏显示相对 HEAD 的改动标记                                                     | CloudCLI、Tern       | 没有                                                                   | 中低   |
| 文件：PDF、SVG、音视频预览                                                                    | CloudCLI、Tern       | 只预览 PNG、JPEG、GIF、WebP                                            | 低到中 |
| 文件：上传整个文件夹，目录由 agent 流式打包后下载                                             | CloudCLI             | 目录拖入不接收，目录不能下载                                           | 中     |
| 定时任务加前置检查命令，退出码非 0 就跳过本次                                                 | Orca                 | 没有                                                                   | 低     |
| 定时任务可以向已有终端发送一段输入，例如额度重置后发 continue                                 | CloudCLI             | 定时任务只能运行命令                                                   | 低到中 |
| 开发服务端口按监听进程的工作目录归到工作区                                                    | Orca                 | 设备级端口快照，不分工作区                                             | 中     |
| 代理页面上的元素拾取：选中元素，生成含选择器、组件名、样式和截图路径的 Markdown，放进撰写草稿 | Orca                 | 没有；代理页面与工作台同源，具备实现条件                               | 中     |
| 撰写草稿写入 sessionStorage，手机回收页面后不丢                                               | CloudCLI             | 只在页面内存                                                           | 低     |
| 撰写框：发送历史、用户自定义片段、工作区路径模糊选择                                          | CloudCLI             | 没有                                                                   | 低到中 |
| PWA 的系统分享入口：从别的应用分享文件，上传后把路径插入某个终端的草稿                        | hapi                 | 没有                                                                   | 中     |
| 结束会话的确认只在有非空闲程序时出现                                                          | Tern                 | 结束会话总是确认一次                                                   | 低     |
| 部署文档补充 Tailscale Serve 和 Cloudflare 具名隧道的做法                                     | hapi                 | 只有反向代理示例                                                       | 低     |
| Linux 上给每个终端一个 systemd scope，可配内存上限，防止一个 agent 拖垮整台设备               | Orca                 | 没有                                                                   | 低到中 |

## 明确不做

| 不做的事                                                                | 谁在做                 | 理由                                                                                                                                    |
| ----------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 自绘聊天界面，接 Agent SDK、stream-json、app-server、ACP                | hapi、CloudCLI、Orca   | 与立场直接冲突。Orca 的聊天层约 8.6 万行，还要靠专门的测试防 SDK 漂移                                                                   |
| 解析会话 JSONL 和其他私有文件，用来做会话列表、搜索、用量统计、自动标题 | hapi、CloudCLI、Orca   | 私有格式随版本变化。Kiteline 的终端常驻，本来就不需要“恢复会话”                                                                         |
| 自动往 `~/.claude/settings.json` 等配置里安装 hooks、状态栏、主题       | Orca、herdr、hapi      | 侵入用户配置。herdr 已经把 Claude 和 Codex 的 hook 状态撤掉，Orca 的文档也承认 OSC 7501 足以表达状态，保留 hooks 只是为了聊天界面和续接 |
| 按屏幕文字匹配来判断状态，包括从远端下载规则                            | herdr、Orca、Tern 社区 | 维护成本见上文。herdr 的规则引擎里还硬编码了 Codex 的提示符字符，说明“纯数据规则”也守不住边界                                           |
| 没有匹配就当作 idle                                                     | herdr                  | Kiteline 现在的口径是“没有报告不能推断空闲”，应该保持                                                                                   |
| 写死各家的 `--resume` 命令表来续接对话                                  | herdr、Tern、Orca      | 新增一个 agent 就要发版                                                                                                                 |
| 向终端注入鼠标滚轮来读全屏 TUI 的历史                                   | herdr                  | 观察不应改变程序状态                                                                                                                    |
| 默认以跳过权限的参数启动 agent                                          | Orca                   | Kiteline 的终端跑在用户真实账户下，没有沙箱                                                                                             |
| 往 agent 注入系统提示和 MCP，默认在提交里加署名                         | hapi                   | 侵入用户的 agent 配置和仓库历史                                                                                                         |
| 内置 LLM 助手、AI 生成提交信息                                          | Tern、CloudCLI、Orca   | 需要 Kiteline 自己持有模型凭据或替用户调用 `claude -p`。想要这个效果，把提示词放进撰写草稿让终端里的 agent 自己提交即可                 |
| 官方中继、账号体系、遥测、付费原生 App                                  | hapi、Orca、Tern       | 与个人自托管定位冲突，还带来长期运营负担                                                                                                |
| 把长期凭据放进二维码 URL                                                | hapi                   | 凭据会进入浏览器历史和访问日志。要做扫码登录，只能用一次性、短时效的登录码                                                              |
| 与主站同源执行、没有权限模型的插件                                      | CloudCLI、Tern、herdr  | 插件能读到登录状态                                                                                                                      |
| 内置浏览器、Computer Use、SQLite 和 Jupyter 面板、看板                  | Orca、Tern             | 范围膨胀。开发服务代理已经覆盖“看页面”                                                                                                  |
| 程序描述界面、终端原生绘制的协议（Tern 的 TSP）                         | Tern                   | 只有自家 agent 能用，对 Claude Code 和 Codex 等于重写前端                                                                               |
| 预测回显                                                                | Tern                   | agent TUI 运行在原始模式下，本地猜测回显容易出错。先测手机上的实际延迟再说                                                              |

## 需要你拍板的取舍

1. **全局队列与现有约定冲突。** `docs/design/interaction.md` 写明程序状态“不汇总到设备或手机导航入口”。我建议改掉这条：手机上侧栏是抽屉，不汇总就等于看不见。但这是一条有意写下的约定，当初的理由我不清楚。
2. **Web Push 让 server 多存一类数据并且主动外连。** 现在 server 不持久化报告，也不向第三方发请求。推送订阅必须落库，推送和 webhook 必须外连。
3. **保留会话会改变一条不变量。** “agent 正常停止会结束全部终端会话”目前写在多份文档里，也是清理逻辑的前提。
4. **worktree 的推送目标。** `docs/design/git.md` 规定 agent 不添加改变推送目标的参数。新建的 worktree 分支没有上游，第一次推送会不会失败取决于用户的 Git 配置。可以选择维持现状并在界面上提示，或者像 Orca 那样只在用户没设置时写入 `push.autoSetupRemote`。
5. **OSC 9;4 进度序列。** `packages/terminal-recorder/src/notice.ts` 现在主动丢弃它。Tern 把它当作 working 信号。我的建议是继续丢弃：发 9;4 的主流 agent 也发 7501，后者信息更完整；而且子调研查到的 issue 显示 Claude Code 只对白名单里的终端发 9;4，在 Kiteline 的 tmux 里多半收不到，这一点没有实测。
6. **不做屏幕规则引擎。** herdr 的子调研提出过一个折中方案：Kiteline 只提供规则引擎，不带任何规则，由用户自己写，结果标为“推断”。我没有采纳，理由是主力 agent 已经有协议状态，而这个引擎一旦存在，用户就会期待 Kiteline 维护规则。如果你有不发 OSC 7501 的 agent 要支持，这是唯一可行的退路，可以到时再议。

## 建议顺序

**第一批，成本低，互相独立。** 会话身份环境变量；按程序状态和按文本的等待；发送的状态条件；远程 CLI 的 `create --shortcut`；页面在后台时的系统通知、提示音、标题计数和应用角标；OSC 7501 支持矩阵写进文档。这一批做完，agent 编排 agent 就有了可靠的回合边界，人在电脑前也不会错过等待。

**第二批，围绕手机体验。** Web Push、全局队列、通知详情里的快照和快捷回键。三项要一起设计，因为推送点击的落点就是那个详情页。之后再加 webhook 通道。

**第三批，围绕并行工作流。** worktree 的创建和登记、相对基线的 diff、diff 行评论回灌、设备本机的发送和观察命令、给 agent 读的指南。

**单独评估。** 保留会话的价值很高，但改动面大，建议先写设计文档，确认 tmux 跨版本的行为再动手。

## 各项目要点

### herdr

和 Kiteline 立场最接近：不包装 harness，只拥有终端。它是一个本机 TUI 复用器，没有 Web 界面，“手机支持”只是窄屏下的单列布局，远程靠 SSH。远程和多设备这一块 Kiteline 的路线更强。

值得看的是它在状态之上建立的那一层：优先级汇总、延迟确认的通知、`prompt --wait` 的活动保护、给 agent 的 skill 文件。这些都不依赖它的检测方式，换成 OSC 7501 作数据源同样成立。它还有一个排查工具 `herdr agent explain`，能输出每条规则是否匹配和判定依据；Kiteline 不做推断所以不需要，但如果将来引入任何推断，这类工具必须同时提供。

它的带外上报接口 `pane.report_agent` 和 Kiteline 的带内 OSC 7501 是同一个思路的两种通道。带内通道跨 SSH 和容器都能用，天然绑定到正确的终端，是更好的选择。

### Orca

功能最全，也最能说明包装 harness 的长期成本。它同时走两条路：原生 TUI 跑在 PTY 里，另有一套自绘聊天界面，两者之间还能迁移会话。

可以直接借鉴的都在不耦合的那一半：worktree 工作流、diff 评论的纯文本交付、元素拾取的输出格式（截图存成文件，文本里列路径，让图片也能走纯文本通道）、CLI 的输出约定（每条输出末尾给出下一步命令，失败时 stderr 为 `error: <code>: <message>`）、定时任务的前置检查。

两处文档宣称的功能在代码里没找到：行级 AI 归属，以及图片 diff 的滑动和叠加对比。

### hapi

状态和审批全部建立在 harness 集成上，核心路线与 Kiteline 相反。外围设计里有三处值得学：按页面可见性决定走页面内提示还是系统推送；runner 用进程号加启动时间做代际标记来安全接管子进程；`hapi job run` 包装长命令并坚持“进度不造假”，没有预计时间就显示不定进度。

它的零配置上手体验最好：一条命令拿到公网地址和二维码。代价是依赖官方中继，并且把长期主凭据放在了二维码的 URL 里。它的网页终端不持久、Git 只读，这两块 Kiteline 远超它。

### CloudCLI（claudecodeui）

典型的“包装 harness 并重绘聊天界面”路线，聊天层没有可借鉴的。它的终端基于 node-pty，浏览器断开 30 分钟后回收，服务重启就全丢；认证方式是第一个访问者成为拥有者，令牌存在 localStorage。这些都不如 Kiteline 现有的方案。

它的价值在于展示了用户想要什么。把它的功能逐项翻译成纯终端手段，得到的就是本文的第 1、3 项和小项清单里的大半：推送通知对应 Web Push，权限审批界面对应快照加回键，工具调用可视化对应相对基线的 diff，定时消息对应定时向终端发送输入，斜杠命令补全对应撰写框的片段和路径选择。

### Tern

闭源，闭测中，信息来自官方文档、官方插件 SDK、一篇第三方评测和社区插件清单，可信度低于其余四个。平台支持的说法有出入：官方文档列了 iOS，第三方评测说的是 Android。

架构上它和 Kiteline 是同构的：守护进程持有会话，多个客户端同时接入，其中一个客户端是浏览器。差别在于它只对自家 agent（omp）做深度原生绘制，对 Claude Code 和 Codex 只给终端层的通用信号。社区随后为这两个 agent 补做的状态显示和原生界面，靠的正是 hooks、读屏和重写前端，其中一个插件直接复用了 herdr 的检测规则。这从反面说明，OSC 7501 这样的协议才是第三方 agent 状态的正解。

可借鉴的是几个交互设计：收件箱、把页面当 `$EDITOR`、只对非空闲程序确认关闭、让一个运行中的终端浮在其他内容之上。

## 调研方法与可信度

五个项目各由一个子 agent 独立调研，四个开源项目读的是浅克隆的源码，没有运行其中任何代码；Tern 读的是公开网页。本文由我综合，并做了以下核实：

- **Kiteline 现状**：文中每一条“现状”都在 Kiteline 的文档或代码里核对过，包括没有 Service Worker 和推送、wait 只有两种模式、终端里没有身份环境变量、本机终端命令只有三个、`notice.ts` 丢弃 OSC 9;4、终端区粘贴只取文本、没有命令面板和 diff 评论、`git.diff` 的比较来源。
- **外部项目的关键证据**：我直接读过 Orca 的 OSC 7501 支持矩阵和协议定义、Orca 记录基线的代码和 diff 评论的格式化代码、herdr 更新日志里 hook 降级的条目和规则文件数量、herdr 注入环境变量的代码、hapi 的可见性路由代码，以及四个仓库的许可文件和提交号。
- **其余文件路径和行号**来自子调研，我没有逐条复核。

没有验证的事项：

- OSC 7501 支持矩阵是 Orca 的测试结果，没有在 Kiteline 里复现。
- tmux 新客户端连接旧版本 server 的兼容性，这决定“保留会话”能做到什么程度。
- Chrome 推送在中国大陆的可达性，文中的说法是通常的经验，没有实测。
- Orca 的移动端、看板、休眠和定时自动化只看了文档，没有读实现。
- Tern 的定价、发布时间线、会话续接机制都没有公开信息。
