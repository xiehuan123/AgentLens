# Contributing to AgentLens

AgentLens reads local agent transcripts and stores normalized evidence in SQLite. Contributions are welcome for rendering, log-format support, and failure diagnosis.

## Develop on macOS

Install the Xcode command-line tools, Rust, and Node.js. Then run:

```sh
cargo run --locked
```

The synthetic demo provides a reproducible starting point. Put parser regressions in the Rust unit tests using minimal synthetic records. Cite upstream protocol documentation or source code when adding a new format.

## Check your changes

```sh
cargo fmt --check
cargo test --locked
node --check ui/app.js
node --check ui/diagnostics.js
node --check ui/requests.js
node --check ui/trace.js
```

Describe the behavior and verification in the pull request. Use the issue templates for reproducible reports and feature proposals. Review exported diagnostics before sharing and keep actual transcripts, database files, and account exports out of commits.

To regenerate the app and interface icon from its source, run `python3 scripts/generate-icon.py`.
