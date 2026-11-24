# AgentLens 竞品与日志调研

调研日期：2026-11-24。竞品能力以项目自己的公开说明为准。本机格式验证读取了 Codex 与 Claude Code 各最近修改的 12 份 JSONL 文件，每份最多检查前 1,800 行。验证记录只保留结构和字段名。

## 同类项目

| 项目 | 公开说明中已提供的能力 |
| --- | --- |
| [QJ-Chen/agentlen](https://github.com/QJ-Chen/agentlen) | 同样使用 **AgentLens** 作为显示名，支持 Codex 与 Claude Code 的本地日志、可搜索会话、层级关系、回放与用量分析，使用 SQLite 和 FastAPI + React。 |
| [gpolaert/trace](https://github.com/gpolaert/trace) | 本地展示 Codex 与 Claude Code 的轮次、配对的工具调用和结果，以及逐轮 token 用量。通过 Python 脚本和 HTML 页面运行。 |
| [Yijia-Zhou/session-analyzer](https://github.com/Yijia-Zhou/session-analyzer) | 跨 Codex、Claude Code 和 DeepSeek Harness 查询会话，提供轨迹视图，以及日志支持的子代理、分叉和审查关系。 |

跨代理浏览和工具回放已是同类工具的常见能力。本项目可以把“这条文件操作有什么日志依据”和“这组 token 数字来自哪里”作为主要体验。调用、结果和缺失状态在同一条时间线上呈现，预置演示展示有记录、记录不完整和工具失败等场景。公开发布前宜重新评估同名冲突。

## Codex 本地日志

本机在 `~/.codex/sessions/` 下观察到 JSONL rollout。一个文件内可混合出现以下记录。

| 层级与类型 | 可读取字段与解释 |
| --- | --- |
| `session_meta`、`turn_context` | 元数据包含会话标识、工作目录和时间等。轮次上下文包含模型和轮次标识等。模型和工作目录可能随轮次变化。 |
| `response_item` / `message` | `role` 和 `content` 表示日志保存的消息。工具调用与普通消息是不同的记录类型。 |
| `response_item` / `function_call`、`custom_tool_call` | `name`、`call_id` 和 `arguments` 或 `input` 表示调用信息。`function_call_output`、`custom_tool_call_output` 可按 `call_id` 匹配。 |
| `token_usage_record` | 本机观察到 `response_id` 及单次 `usage`、轮次累计 `turn_token_usage`、会话累计 `thread_token_usage`。这三种口径不可混加。 |
| `event_msg` / `token_count` | 本机观察到 `info.total_token_usage` 与 `info.last_token_usage`。前者是当时记录的累计值。重复快照不可相加。 |

两种 token 记录中均观察到 `input_tokens`、`output_tokens`、`total_tokens`、`cached_input_tokens`、`cache_write_input_tokens`、`reasoning_output_tokens`。优先使用同一数据流最近的累计快照，数字缺失时应显示未知。缓存和推理计数需要作为独立字段展示。累计量可能受恢复、分叉和日志保留策略影响。[Codex 持久化策略](https://github.com/openai/codex/blob/main/codex-rs/rollout/src/policy.rs) · [Codex token rollout 测试](https://github.com/openai/codex/blob/main/codex-rs/app-server/tests/common/rollout.rs)

可用显式补丁声明提取新增、修改、移除等操作，并通过工具结果判断状态。Codex 的线程历史实现也识别 `patch_apply_begin` 和 `patch_apply_end`。这些事件在本次有限样本中未观察到，存在与否取决于记录版本及策略。Shell 命令的全部文件副作用通常无法从这些记录可靠还原。[Codex 线程历史实现](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/thread_history.rs)

## Claude Code 本地日志

本机在 `~/.claude/projects/` 下观察到 JSONL 会话文件。Claude Code 官方 Hooks 文档记录了 `transcript_path` 字段及独立的 `subagents/` 子会话目录。以下内容块与元数据来自本机样本，内部磁盘格式可能随版本变化。[Claude Code Hooks 参考](https://code.claude.com/docs/en/hooks#common-input-fields) · [子代理会话路径](https://code.claude.com/docs/en/hooks#subagentstop-input)

| 类型 | 可读取字段与解释 |
| --- | --- |
| `user` / `assistant` | 会话行可带 `sessionId`、`timestamp`、`cwd`、`uuid`、`parentUuid`。助手消息可带 `message.id`、`message.model`。 |
| `message.content[].tool_use` | `id`、`name` 与 `input`。显式读写工具的 `file_path` 等参数可作为文件操作的依据。 |
| `message.content[].tool_result` | `tool_use_id` 可与调用配对。存在 `is_error` 等状态字段时可展示明确的结果。 |
| `message.usage` | 可含 `input_tokens`、`output_tokens`、`cache_read_input_tokens` 和 `cache_creation_input_tokens`。同一 `message.id` 下可能记录多个内容块，同一消息的用量应去重。 |
| `file-history-snapshot` | 观察到快照相关字段。快照本身不能确定由哪个工具操作造成具体路径的改动。 |

Anthropic 的输入 token 总量按官方定义为普通输入、缓存读取与缓存写入之和。仅在所需字段已知时合计，输出与缓存分项分别可查。[Anthropic Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

## 能力边界

时间线依据日志记录顺序与保存的时间戳。缺少配对结果、时间、模型或用量时，应直接显示未知。即使记录包含内部内容块或加密字段，也无需为时间线展示它们。会话只能证明日志记录到的行为。没有打开的实时事件源时，文件内容和时间戳无法证明代理当前仍在运行。
