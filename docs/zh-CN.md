# AgentLens 使用指南

## 启动与打包

在 macOS 安装 Rust、Cargo 和 Xcode 命令行工具后，在项目根目录运行：

```sh
cargo run --locked
```

使用 `./scripts/package-macos.sh` 生成当前 Mac 架构的本地应用，产物位于 `target/release/bundle/macos/AgentLens.app`。命令后加 `debug` 可生成调试构建，位于 `target/debug/bundle/macos/`。

## 从失败定位相关修改

1. 应用默认打开演示模式。点击「浏览本机会话」，从左栏按来源或项目查找会话。自定义位置可通过对应的「添加日志目录」按钮指定。
2. 在时间线点开失败卡片，查看命令、错误输出及日志记录的退出码。点「查看前一次修改」可跳转到相关补丁。
3. 有明确文件路径时，可以筛出本轮的同文件步骤。主时间线存在明确派发记录且能定位子会话时，可以展开查看。
4. 往上翻查记录时，后续日志继续载入。点击新增步骤提示回到最新位置。
5. 顶栏可切换中英文。命令、日志消息和输出会按记录内容显示。

## 数据位置

AgentLens 只读 Codex 与 Claude Code 源日志。已解析的日志及读取进度保存在 `~/Library/Application Support/dev.agentlens.desktop/sessions.sqlite3`，演示数据使用独立的 `demo.sqlite3`。步骤详情按原始内容存入该数据库，可能包含凭证、源码和个人信息。应用不会上传日志。Token 用量以日志实际字段为准，缺失值标为未知。

## 导入 ChatGPT 桌面聊天

1. 用桌面聊天所用的同一账户在 ChatGPT 设置里申请[数据导出](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data)，下载并解压。
2. 在 AgentLens 打开「浏览本机会话」→「导入 ChatGPT 聊天」，选择导出中的 `conversations.json` 或编号的会话 JSON 文件。
3. 在左侧 ChatGPT 分组按标题打开聊天。可以查看导出中当前分支的可见用户与助手文本，以及记录中的时间。重复导入按会话 ID 更新。导入保存在本机 SQLite。

ChatGPT 导入是历史快照。要更新记录，请导入更新的导出文件。普通聊天的实时执行、未导出的工具日志、Token 用量和附件暂不提供。
