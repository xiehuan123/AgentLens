# AgentLens 使用指南


[下载 macOS 与 Windows 安装包](https://github.com/xiehuan123/AgentLens/releases/latest)
## 启动与打包

在 macOS 安装 Rust、Cargo 和 Xcode 命令行工具后，在项目根目录运行：

```sh
cargo run --locked
```

使用 `./scripts/package-macos.sh` 生成当前 Mac 架构的本地应用，产物位于 `target/release/bundle/macos/AgentLens.app`。命令后加 `debug` 可生成调试构建，位于 `target/debug/bundle/macos/`。

## 从失败定位相关修改

1. 应用启动后自动查找本机会话。从左栏按来源或项目查找会话。自定义位置可通过对应的「添加日志目录」按钮指定。
2. 在时间线点开失败卡片，查看命令、错误输出及日志记录的退出码。点「查看前一次修改」可跳转到相关补丁。
3. 有明确文件路径时，可以筛出本轮的同文件步骤。在派发步骤的详情里点「展开子会话」，可查看子智能体消息、工具和结果，也可刷新或打开完整子会话。日志缺少关联 ID 或子会话文件时，界面会分别标明。
4. 执行时间线最新记录在顶部。往下翻查旧记录时，视图保持当前位置。点击新增步骤提示可回到顶部。
5. 顶栏可切换中英文。命令、日志消息和输出会按记录内容显示。

## 数据位置

AgentLens 只读 Codex 与 Claude Code 源日志。已解析的日志及读取进度保存在 `~/Library/Application Support/dev.agentlens.desktop/sessions.sqlite3`。步骤详情按原始内容存入该数据库，可能包含凭证、源码和个人信息。应用不会上传日志。Token 用量以日志实际字段为准，缺失值标为未知。

## 导入 ChatGPT 桌面聊天

1. 用桌面聊天所用的同一账户在 ChatGPT 设置里申请[数据导出](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data)，下载并解压。
2. 在 AgentLens 打开「浏览本机会话」→「导入 ChatGPT 聊天」，选择导出中的 `conversations.json` 或编号的会话 JSON 文件。
3. 在左侧 ChatGPT 分组按标题打开聊天。可以查看导出中当前分支的可见用户与助手文本，以及记录中的时间。重复导入按会话 ID 更新。导入保存在本机 SQLite。

ChatGPT 导入是历史快照。要更新记录，请导入更新的导出文件。普通聊天的实时执行、未导出的工具日志、Token 用量和附件暂不提供。

## Codex 模型和轮次诊断

时间线的「模型和轮次」分类显示日志记录的轮次开始、结束、中止、模型响应标识和响应流错误。步骤详情会显示可取的调用 ID、轮次 ID、请求或响应 ID、耗时及错误原因。旧会话重新打开时，会从源日志重新提取可用字段。

Codex 本地日志保存的响应 ID 可用于定位已有响应记录。原始请求参数、失败尝试和重试对应关系取决于 Codex 版本与日志保留策略。缺少明确关联时，AgentLens 不会按时间顺序推断工具属于哪一次模型请求。

## 排查面板与请求记录

点击「排查会话」，按轮次查看失败、相关修改及后续相同命令，也可以查看文件改动、验证命令，以及 Skills / MCP 汇总。关联仅基于日志里已有的路径和命令。找不到匹配的验证时会明确标注。

在「导出排查包」选择要分享的步骤。默认仅显示记录位置、时间、类型及状态。可按需加入命令、参数、输出、文件路径、补丁和原始日志位置，再预览并保存本地 Markdown。

时间线的「请求」筛选会列出有证据的模型响应或流错误，以及外部工具、网页操作和已识别的 HTTP 命令线索。方法、目标 URL 和 HTTP 状态码取自日志。AgentLens 不监听实际网络流量，普通聊天导出也不含这类执行数据。

## 一条命令发布 macOS 和 Windows

在当前版本与标签一致、已提交的 `main` 分支上运行：

```sh
./scripts/release.sh v0.3.0
```

命令会推送主分支和版本标签，GitHub Actions 自动构建 Apple 芯片和 Intel Mac 的应用 ZIP、Windows x64 的 NSIS 安装程序，并把三个包和 SHA-256 校验文件上传到同一个 GitHub Release。私有仓库的下载权限由 GitHub 仓库权限控制。首次发布需要对仓库和 GitHub Actions 工作流有写权限。macOS 包使用临时签名，Windows 安装程序未签名。

## 开启 Codex Trace 并查看原始模型请求

点击顶栏「Codex Trace」。面板区分 AgentLens 是否继承录制目录配置、是否打开 Trace 包，以及包是否完整封存。桌面应用与终端可能读取不同环境变量。

macOS 从终端启动新的 Codex CLI 会话：

```sh
CODEX_ROLLOUT_TRACE_ROOT="$HOME/agentlens-traces" codex
```

Windows PowerShell：

```powershell
$env:CODEX_ROLLOUT_TRACE_ROOT = Join-Path $HOME 'agentlens-traces'
codex
```

在 AgentLens 选生成的 Trace 子目录。含 `state.json` 时选择「打开已生成的 Trace」。否则选择「用 Codex 处理 Trace」，再选择**录制该包的同一个 Codex 可执行文件**。AgentLens 会调用本机 `trace-reduce` 并把临时索引写到独立目录，打开后可查看模型尝试和已完整记录的原始 HTTP 请求体或 WebSocket 消息。源包保持只读，原始请求不写入会话 SQLite 或排查包。普通历史日志无法补录。 [Codex Rollout Trace 说明](https://github.com/openai/codex/blob/main/codex-rs/rollout-trace/README.md)

## Agent Insights、Skills Studio 与 MCP Studio

左侧导航打开 **Agent Insights**。首次打开会按批次索引本机记录，覆盖卡片显示已处理范围与错误。默认看近 30 天，可按时间、项目、Agent 来源或证据等级筛选。点击曲线桶、排名或活动可下钻。

- **Skills Studio** 展示检测到的用户、项目、插件和系统文件。按路径区分同名技能。快照使用 SHA-256，覆盖 SKILL.md 和预算内可读的 UTF-8 资源，支持内容预览和快照对比。首次观察时间是 AgentLens 记录时间。
- **技能调用**使用明确选择和加载作为证据；文件或脚本引用单列候选。历史版本缺少直接关联时显示未知。当日志不能区分同轮重复调用时，同技能、同路径、同轮合并一次。
- **MCP Studio** 展示可见配置与历史服务，按服务和工具统计成功、失败、拒绝和未知。敏感配置值及调用内容不会进入分析页，打开原会话可核对原始记录。运行状态始终以实际证据为准。
- **反馈**可以从会话步骤、技能详情及活动记录创建、编辑或删除，保存到本机数据库。Evolution 和 Evaluations 暂时只保留入口。

技术边界及验证方法见 [可行性报告](agent-insights-feasibility.md) 和 [实施进度](agent-insights-progress.md)。

### 从 Skill 的实际使用整理评估集

在「Skills 中心」打开指定 Skill，进入「评估样本」。软件按调用证据关联会话轮次，使用者只需勾选并填写可分享的输入和观察，再预览保存 JSON。作者可在顶部「评估集」导入贡献，审核应触发或不应触发及验收条件，分别导出开发集或金标留出集。同一会话的已审核案例归入同一个集合。缺少明确调用的案例不会出现在确认调用列表。

Skills 中心单独显示已确认调用和候选证据。用户通过选择器指定技能，或明确要求使用且同轮确认了实际读取，计为主动调用。AI 自己声明使用，且同轮工具结果可核对到技能内容，计为被动调用。仅有路径引用的记录保留为候选。调用详情可以查看分类所用的消息和工具证据。

在「评估样本 → 完整会话」可以跨页勾选多个关联会话，并把完整原始会话日志保存为一个本机 JSON。每个归档项保存该会话源文件中的全部记录，包括未识别事件和可读取的残缺行。原始数据可能含私有内容，保存前会预览会话清单。「评估贡献包」仍用于分享经过整理、可供作者直接导入审核的案例。

在会话顶部打开「文件操作」，按路径搜索或筛选整个会话及指定轮次的读取、写入、修改、创建、删除和移动。展开文件即可跳到原步骤确认结果。Codex 运行器注入的 `AGENTS.md` 内容显示在「注入上下文」。Shell 仅分类能可靠识别路径的简单命令，复杂命令可在时间线复核。
