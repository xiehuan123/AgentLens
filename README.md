<img src="icons/icon.png" width="84" height="84" alt="AgentLens logo">

# AgentLens

[简体中文](docs/zh-CN.md) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)

AgentLens is a local-first macOS desktop viewer for Codex and Claude Code execution logs. Follow a session as records are written, replay earlier turns, and inspect a failed command alongside the file edits recorded before it.

## What you can do

- **Inspect a failure.** See the failed command and error output, find prior edits that match recorded file paths, and check whether the same command ran again in that turn.
- **Verify a turn.** Review recorded edits and recognizable check commands, including their exit codes when available.
- **Browse file activity.** Group recorded reads, writes, edits, additions, deletions, and moves by file. Inspect injected Codex instructions such as `AGENTS.md` separately and jump to the original step.
- **Review Skills and MCP.** Group calls by name and distinguish explicit Skill invocations from references to Skill files.
- **Inspect request evidence.** See recorded external tool inputs and model response IDs in the **Requests** filter. This view uses source logs, so network status, HTTP status codes, and retry associations appear only where the log supplies them.
- **Share selected evidence.** Preview a local Markdown report. Commands, arguments, output, paths, and IDs are opt-in fields.

| Source | Live follow | History |
| --- | --- | --- |
| Codex | Local JSONL | Local JSONL and archives |
| Claude Code | Local JSONL | Local JSONL |
| ChatGPT desktop | — | Imported account export snapshots |

## Run locally

Use macOS with Rust, Cargo, and the Xcode command-line tools.

```sh
cargo run --locked
```

The app opens in a synthetic demo. Choose **Browse local sessions** to discover real sessions. Use **English** or **中文** in the header to change the interface language. The app remembers the choice.

## Build a macOS app

```sh
./scripts/package-macos.sh
open target/release/bundle/macos/AgentLens.app
```

Pass `debug` for a faster local build. The script produces a locally signed app bundle for the current Mac architecture. Distribution signing and notarization are separate release steps.

## Logs and storage

- Codex uses `$CODEX_HOME/sessions` and `$CODEX_HOME/archived_sessions`, with `~/.codex` as the default home.
- Claude Code uses `$CLAUDE_CONFIG_DIR/projects`, with `~/.claude` as the default config directory. Both sources accept extra log folders selected in the app.
- Source JSONL is read only. AgentLens writes session data to `~/Library/Application Support/dev.agentlens.desktop/sessions.sqlite3` and uses a separate `demo.sqlite3`. The app makes no log upload requests.
- Recorded tool details and user-visible messages are shown without redaction. The session database can contain source code, secrets printed in logs, and personal data. Internal reasoning content and encrypted fields are excluded from the parsed events.
- The timeline reflects records the agent saved. A result, a field, or an association can be missing. Usage is derived from recorded token fields.

## Basic checks

```sh
cargo fmt --check
cargo test --locked
node --check ui/app.js
node --check ui/diagnostics.js
node --check ui/requests.js
node --check ui/trace.js
```

See the [Chinese guide](docs/zh-CN.md), [diagnostics roadmap](docs/diagnostics-roadmap.md), and [log research](docs/research.md).

## Import ChatGPT desktop chats

Request a [ChatGPT data export](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data) for the account you use on desktop. Extract the ZIP, open **Browse local sessions → Import ChatGPT chats**, then select the conversation JSON file or its numbered parts. AgentLens keeps the current branch's visible text and recorded timestamps in local SQLite. Re-importing updates existing conversation IDs. These imported snapshots have no live feed, attachments, or agent execution telemetry.

## Publish release builds

From a committed `main` branch with push access to `origin`, run:

```sh
./scripts/release.sh v0.2.2
```

The tag must match both `Cargo.toml` and `tauri.conf.json`. The command pushes `main` and the version tag. GitHub Actions publishes macOS Apple silicon and Intel app ZIPs, a Windows x64 NSIS installer, and SHA-256 checksums to the same Release after all builds succeed. Private repositories keep the Release accessible to users with repository access. These builds use local macOS ad-hoc signing and unsigned Windows installers.

## View original Codex model requests

Use **Codex Trace** in AgentLens for recording status and platform-specific instructions. Codex can record new CLI sessions locally when launched with `CODEX_ROLLOUT_TRACE_ROOT` set. In AgentLens, open the generated bundle, or reduce it with the same Codex executable that recorded it.

The viewer lists recorded model attempts, IDs, timings and linked tool calls. Complete outgoing request bodies are loaded on demand from the selected bundle. The view keeps the trace separate from the session database and diagnostics exports. It reflects what the recorder captured, including capture gaps. See [Codex Rollout Trace](https://github.com/openai/codex/blob/main/codex-rs/rollout-trace/README.md).

## Agent Insights and capability studios

Open **Agent Insights** to index local history in batches and explore real Skill and MCP activity by time, project, provider, or evidence confidence. **Skills Studio** discovers scoped SKILL.md files and stores local content snapshots. **MCP Studio** separates configured servers from observed calls and keeps sensitive payloads out of analytics. Add structured feedback from a session step or invocation. See the [Chinese usage guide](docs/zh-CN.md#agent-insightsskills-studio-与-mcp-studio) and the [implementation notes](docs/agent-insights-feasibility.md).

### Build Skill evaluation cases from local sessions

In **Skills Studio**, open a skill and choose **Evaluation cases**. AgentLens matches that skill's confirmed calls and shows their recorded turns. Select cases, prepare shareable inputs and observations, and preview the contribution before saving a JSON file. Authors can import it under **Evaluations**, review the expected trigger and checks, then export development or gold holdout datasets. Contributions are saved locally as files.

In the same panel, **Full sessions** lets you select multiple linked sessions and save all original records from their source files in one local JSON file. Use **Evaluation contribution** to share edited case drafts instead.
