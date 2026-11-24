# AgentLens

AgentLens is a local-first macOS desktop viewer for Codex and Claude Code execution logs. Follow a session as records are written, replay earlier turns, and inspect a failed command alongside the file edits recorded before it.

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
```

See the [Chinese guide](docs/zh-CN.md) and [log research](docs/research.md). Licensed under the [MIT License](LICENSE).
