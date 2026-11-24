# 一次会话如何排查

调研日期为 2026-11-24。以下按用户排查顺序列出应补的记录与功能。竞品对照以其公开 README 为准。

## 优先补齐的日志

| 优先级 | 要回答的问题 | 最少需要的记录 |
| --- | --- | --- |
| P0 | AI 实际执行了什么？ | 记录调用 ID、轮次和子会话 ID。命令卡显示工作目录、原始命令或脚本、输出、退出码和状态。Codex Code Mode 有外层脚本和内部调度两层，内部命令及 MCP 只在有独立记录时展开。开始、完成与结果使用同一调用 ID 或明确关系合并；缺结尾、输出截断和解析缺口分别标记。 |
| P0 | 调用了哪些 Skills 和 MCP？ | Skills 分开标注显式调用、明确加载、读到 `SKILL.md` 和仅提及。Claude Code 的 `Skill` 工具能提供显式调用证据。Codex 通过用户输入或选择后加载技能内容，历史记录可能只留下文件读取。MCP 显示服务、工具、参数、结果，另标日志确认的失败、拒绝和取消。 |
| P0 | 「事件」有什么用？ | 把常见事件写成说明，例如「启动本轮」「等待权限批准」「压缩上下文」「子代理任务结束」。技术类型保留在详情。用调用 ID 已合并的完成事件收进对应卡片，其余未知类型留在事件筛选，并标来源。 |
| P1 | 为什么失败、重试或看起来卡住？ | 关联首条明确的失败、错误来源、重试、退出码、授权决策和后续验证。展示开始与结束、执行耗时和等待授权。缺少实际耗时可显示由时间戳推导的区间，明确它可能包含排队或审批。使用请求 ID 和父子关系区分并行调用。 |
| P1 | 它动了哪些文件，有没有验证？ | 保存已记录的读取、修改、重命名、删除、补丁和测试结果。用路径与时间关联错误和附近修改，保留调用结果的来源。命令未暴露文件副作用、日志没记录后续测试或改动只能从 Git 观察时，分别标明证据边界。 |
| P1 | 外部调用具体发生了什么？ | 识别明确记录的 Web 搜索、浏览器动作、MCP、网络权限请求。来源有记录时展示搜索词、动作、目标域名、授权决策及结果。一般 shell 或应用请求可能没有网络层记录，显示「目标未记录」，不由命令文本推断成功、完整请求或数据流。 |

Codex App Server 对命令、文件修改和 MCP 定义了结构化项目，也定义了重试与审批状态。Codex Hooks 明确涵盖 Code Mode 内部工具，并提供每次模型尝试的状态。Claude Code 的失败 Hook 提供工具 ID、错误与可选耗时，部分执行前拒绝走其他事件或只体现在工具结果中。这些文档描述可以进一步采集的接口。现有历史 JSONL 实际可见字段以解析结果为准。[Codex App Server](https://learn.chatgpt.com/docs/app-server) · [Codex Hooks](https://learn.chatgpt.com/docs/hooks#tool-calls-from-code-mode) · [Claude Code Hooks](https://code.claude.com/docs/en/hooks#posttoolusefailure-input) · [Claude Code Skills](https://code.claude.com/docs/en/skills#restrict-claudes-skill-access) · [Codex Skills](https://learn.chatgpt.com/docs/build-skills)

先增强只读解析、原始记录定位和日志缺口提示。确实需要补采时，再提供用户主动启用的本地 Hook 记录器，只记录配置允许的事件和字段。普通 ChatGPT 导入维持历史快照定位，记录缺失时在界面显示可用范围。

## GitHub 竞品与可做的差异

| 项目 | 公开已有能力 | 对 AgentLens 的启示 |
| --- | --- | --- |
| [AgentsView](https://github.com/kenn-io/agentsview) | 多代理发现、本地 SQLite、搜索、费用和统计 | 通用浏览和统计已有成熟产品。 |
| [Session Analyzer](https://github.com/Yijia-Zhou/session-analyzer) | 命令与输出、差异、Code Mode 部分结构化操作、原始记录引用、子会话导航 | 可读命令、原始证据和分类都是排查基础。 |
| [Agent Timeline](https://github.com/Cerlancism/agent-timeline) | 实时跟看、回放、代理关系图、调用详情 | 关注能否从上百条事件直接定位一个问题。 |
| [Nostraxis](https://github.com/DaniBelmonte/Nostraxis) 与 [AgentTrace](https://github.com/daylorwilliams5/AgentTrace) | 前者支持并行泳道、多会话与实验比较，后者定位可观察的轨迹分歧 | 会话对比方案需要定义任务基线和要验证的变化。 |

## 建议实施顺序

1. **本轮排查视图。** 会话打开后可跳到首个明确失败。并排显示失败前最近的相关修改、当前命令和输出、同一目标后续重试或验证。每条线索可跳回记录，记录不足时保留提示，用户判断因果。
2. **Skills 与 MCP 排查页。** 按名称聚合本轮调用并跳到原步骤。显示证据类型、结果、失败原因和已记录耗时。用筛选回答「这个 Skill 有没有启动」与「哪个 MCP 报错」。当多个动作同时发生，只按已知调用关联归因。
3. **可分享的最小排查包。** 人工选取问题片段，预览再导出。包内包含保留的命令片段、状态、相关文件路径、原始记录定位、解析器版本及缺少的证据。分享副本中可逐字段隐藏敏感内容。默认本地生成。
4. **修复前后验证对比。** 对同项目、同任务分别标记基线和修复后会话，突出首次可验证的差异以及验证命令的结果。初始版本、配置或任务不同要提示，避免把环境变化归因于 Agent。

可用一段脱敏的演示轨迹做验收。模拟一次 MCP 拒绝和一次测试失败后修复重跑，目标是三次操作内从会话定位出错步骤及前后验证，并能逐条核对来源。分类、搜索、回放各自已被多种工具覆盖，上面这组流程是目前最值得验证的产品假设。

## DeepSeek Harness 的 Trajectory 参考

DeepSeek Harness 给每条会话事件保存单调序号、毫秒时间、类型和内容。它保存轮次与请求步骤、用户和助手消息、失败或取消的模型尝试，以及工具的调用 ID、原始参数、结果和可选错误原因。工具提供的附加记录可含变更差异。请求配置、路由变化、上下文压缩和 Hook 调用也会留下各自的事件。部分字段属于运行器内部，能否读取取决于日志格式和采集方式。[会话日志协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)

Trajectory 把这些事件投影成按请求步骤分组的清单，工具调用与结果配对。上方时间概览使用实际时间和耗时，下方清单可以按所选时间区间查看，向上滚动时暂停自动跟随。AgentLens 本轮借鉴按轮次分组、工具和结果合并、默认收起底层事件的做法。按时间区间筛选、耗时概览和请求级关联可在采集到对应时间和标识后再加入。[Trajectory 实现说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-trajectory/README.md)
