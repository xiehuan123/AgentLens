# Agent Insights 技术可行性与实施计划

调研范围为本机最近修改的 36 份 Codex rollout，每份最多读取前 2,500 行。仅保留脱敏结构和计数。Rust/Tauri 在后台读取 JSONL，SQLite 的 sources 游标、events 及 catalog 已服务会话回放。原生 WebView 使用无框架 HTML/CSS/JS。保留原交互，新增能力页面和本地索引。

| 数据 | 等级 | 证据与边界 |
| --- | --- | --- |
| 用户选择技能 | Reliable | 6 条用户文本以 Markdown 技能选择链接开头。4 个轮次同时存在 `skills.selected_skill_instructions`。仅采集带 SKILL.md 路径的前置选择链接，忽略正文举例。 |
| 技能已加载 | Reliable | SDK 元数据标记 `skills.selected_skill_instructions`，文本包含 name 和 path。与同轮同路径的用户选择合并。没有匹配时归 Unknown，除非另有明确自主选择证据。 |
| 自主调用 | Unavailable | 样本未发现可证明自主选择的事件。不能从缺少用户选择反推。 |
| 文件引用 | Inferred | 57 条调用参数提及 SKILL.md，作为 Candidate，不参与正式调用数。技能清单只表示发现。 |
| 历史版本 | Unavailable | 日志未提供可稳定匹配本地快照的内容哈希。版本留空。 |
| MCP 调用 | Reliable | 16 条带 MCP 命名空间的调用，35 条结构化 McpToolCall 完成记录。按会话和调用 ID 合并，工具唯一键包含服务名。 |
| MCP 结果和耗时 | Reliable / Unavailable | 有明确状态、退出证据或 isError 才确定结果。读结构化 duration；缺值标 Unknown。配置不能证明运行状态。 |
| 项目/范围 | Reliable / Inferred | 会话 cwd 和源文件偏移可追溯。项目目录别名和缺失 turn ID 不应被猜成真实关系。 |

脱敏等形样例：

```json
{"type":"response_item","payload":{"type":"message","role":"user","content":[{"text":"[$example](/redacted/example/SKILL.md)"}],"internal_chat_message_metadata_passthrough":{"turn_id":"turn-A","content_item_kinds":["user.text"]}}}
{"type":"response_item","payload":{"type":"message","role":"user","content":[{"text":"<skill>\n<name>example</name>\n<path>/redacted/example/SKILL.md</path>\n</skill>"}],"internal_chat_message_metadata_passthrough":{"turn_id":"turn-A","content_item_kinds":["skills.selected_skill_instructions"]}}}
{"type":"event_msg","payload":{"type":"item_completed","turn_id":"turn-A","item":{"type":"McpToolCall","id":"call-A","server":"redacted","tool":"read","status":"completed","duration":{"secs":1,"nanos":0}}}}
```

官方 Codex 按仓库、用户、管理员和系统作用域发现技能，可跟随技能目录符号链接。同名不会合并。插件缓存是可读取资产，是否启用另行验证。App Server 的 skills/list 是运行时视角，本阶段不启动后端或 MCP Server。 [Codex Skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills) · [App Server](https://learn.chatgpt.com/docs/app-server#skills)

SkillAdam 以任务和评分规则评估技能，先验证改动再写入，支持逐项审核。self-learning-skills 把经验先写入本地记录，经过复核再生成改动包。AgentLens 在此阶段保存手动反馈及原始证据引用，保留版本和评估边界。 [SkillAdam](https://github.com/ruc-datalab/SkillAdam) · [self-learning-skills](https://github.com/scottfalconer/self-learning-skills)

## 实施顺序

1. 技能注册和 SHA-256 快照，按路径区分身份；采用元数据快速检查与周期扫描，保存首次观察。关联文本资源文件使用有界预算。
2. 在已有 JSONL 游标事务内投影技能证据，再根据同轮路径保守聚合。处理截断、重复证据和日志替换。
3. 复用 MCP 配对投影，只发布配置允许列表字段。参数和结果留在原会话，分析视图保守展示脱敏内容。
4. 添加有索引的 SQLite 统计、分页和覆盖情况。索引独立执行，逐会话提交，避免页面刷新读全量日志。
5. 新增 Insights、Skills Studio、MCP Studio 和反馈页面。图表使用现有 CSS，证据定位使用会话键及字节偏移。
6. 验证真实分布和空状态，并用合成夹具测试同轮去重、未知版本、截断、失败、删除、敏感内容和旧数据库兼容。

候选误判包括本文档或工具代码中的示例、不同仓库同名技能、跨版本引用、同名 MCP Tool 以及重复保存的结果记录。项目/时间过滤只影响历史调用，当前配置快照独立呈现。索引在首次追赶中可见覆盖缺口，随后只处理新增数据。
