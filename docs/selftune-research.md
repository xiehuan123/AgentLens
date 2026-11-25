# selftune 源码调研与 AgentLens 路线

调研日期 2026-11-25。公开仓库浅克隆到 `/private/tmp/agentlens-selftune-20261125`。HEAD 为 `5335ce6a6e5469b2adf57bdb8035a6f3461a76a4`，提交和提交者时间均为 2026-10-24 10:15:53 +03:00，Git 标签是 `v0.5.3`，根包及桌面包清单是 `0.5.2`，内部 CLI 工作区包是 `1.0.0`。版本定位以 SHA 和标签为准。根许可证为 MIT，版权为 2026 WellDunDun。 [固定提交][commit] · [包清单][manifest] · [许可证][license]

调研读取了四份产品文档、实际入口、数据写入和上游测试断言。selftune 侧为静态验证，本机未发现 Bun 和克隆目录依赖，未运行其 CLI、Hook、服务或评估。AgentLens 侧执行了现有 Rust 真实日志测试，数据库建在测试临时目录，另以只读脚本统计原始记录的字段存在性。统计仅输出计数。AgentLens 的业务代码、实际数据库、原始会话和 Skills 均未改动。

## 1. 架构与文档核对

| 文档 | 源码核对结果 |
| --- | --- |
| [README][readme] | CLI、桌面、历史导入和 Skill 管理均有入口。“No extra API keys”指能调用已安装且已认证的 Agent CLI。Judge、生成候选、主动重跑仍可能调用模型。README 封装的低延迟 Hook 与直接读取历史 rollout 是两条路径。 |
| [ARCHITECTURE][architecture] | `apps/cli` 注册命令，`apps/local` 组织本地服务与路由，`apps/desktop` 是桌面宿主。能力由 harness、local-store、observability、library 等包提供。独立历史源同步和两类数据库在源码中均有实现。 |
| [ROADMAP][roadmap] | 其中的 Codex Sandbox 仍列作计划。当前另有 Codex 实验性宿主回放和受限的历史任务重跑。两者的入口和覆盖范围不同，以代码中的支持条件为准。 |
| [PRD][prd] | 触发、执行过程、产物质量是三个不同问题。确定性规则能直接校验其中一部分，语义质量和自动改写另有模型调用。PRD 的“所有查询”目标超出了当前 Codex 批量导入的首条提示粒度。 |

## 2. Codex 源码链与证据口径

1. **入口和检查点。** `apps/cli/src/effect-cli/commands/sync.ts::runSyncActionWithDependencies` → `packages/orchestration/src/sync/live-source.ts::syncSourcesLive` → `packages/orchestration/src/sync.ts::syncSources` → `packages/harnesses/codex/src/source-sync.ts::makeSyncCodexSource`。发现 `CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`，支持 UTC 日期剪枝，默认发现函数不遍历 `archived_sessions`。文件指纹含 normalizer/projection 版本。有效文件在 canonical 写入及分析投影完成后推进 marker，无法生成分析批次的合法结果也可完成，`parse=null` 则记为已检查但跳过。异步扫描分块且可取消，格式无效的行跳过。 [同步命令][sync-command] · [源适配器][source-sync] · [发现函数][rollout-find] · [扫描器测试][scanner-test]
2. **解析与关联。** `parseRolloutTextAsync / parseRolloutFileAsync` → `makeRolloutParser::onLine` → `finish`。会话 ID 优先来自 `session_meta.payload.id`，缺失回退文件 stem。收集账户无关的运行信息，如 cwd、模型和部分策略，以及工具计数、命令、错误和时间边界。兼容本地 `session_meta / turn_context / event_msg / response_item` 和 CLI 输出的 `turn.* / item.*`。`buildCanonicalRecordsFromRollout` 保存会话、一个首条有效提示、一条会话执行汇总，以及每技能名一条调用。多轮中同一技能归并，调用统一关联首条有效 prompt ID；`turn_context` 主要用于计数和合并配置，未构造逐轮调用链。 [解析分支][rollout-parse] · [投影字段][rollout-canonical] · [多轮断言][rollout-tests]
3. **意图与读取证据。** `rememberTrustedSessionSkillNames` 仅从会话元数据的专门可用技能段补充名称，并纳入本机／工作区发现的名称。用户文本先经过封装过滤，再用 `$名称`、英文调用短语、路径和内部目标匹配；参数或命令里的 Skill 路径也会走 `detectExplicitSkillReads`。这些分支都可调用 `markSkillTriggered(name, "explicit")`。这里的 `explicit` 可以表示用户提及，也可以表示路径引用。进一步写数据库时，这个解析标签又统一传给 `deriveInvocationMode({has_skill_md_read:true})`，写出 `implicit / 0.7`，不能用它反推 Agent 自主决策。声明了 `inferred` 槽位，但本调研未找到该 Codex rollout 分支实际写入 `inferred` 的调用点。测试甚至明确把已知路径读取视为触发。 [识别分支][rollout-detection] · [分类映射][normalization] · [明确提及测试][explicit-test] · [封装边界测试][rollout-tests]
4. **精确读取线索。** `createSkillReadEvidenceCollector` 以 `call_id` 配对参数和输出，识别 `Read/read_file`、单一绝对路径的 `cat`，以及仅命中一个绝对路径的 Desktop custom-tool 输入。保存原始输出 SHA-256、字符数、输出行号；它不证明命令一定成功、读全文件或读取了整个包。多个文件路径或多次不同输出保持歧义，canonical 包版本仍是 `unknown`。当前入口未匹配 Codex 的 `content_item_kinds`，AgentLens 对该元数据的解析属于独立证据。 [收集器][read-evidence] · [版本证据边界测试][read-evidence-test]
5. **两条采集路径。** 文件历史同步不依赖 Hooks 或 LLM。Codex Hook 安装是另一条可选入口：`handleSessionStart` 复用 prompt-log 并可能注入建议，`handlePreToolUse` 可拦截某些 Skill 写入并捕获修改前状态，`handlePostToolUse` 记录工具、提交及修改后状态，`handleStop` 写收尾遥测。源码还有 CLI `--json` wrapper，不能据此推定所有 Desktop 构建都能使用 Hook 或取得原始模型请求。 [Codex Hook][hook] · [CLI wrapper][wrapper] · [平台支持][readme]

**应借鉴的证据模型。** 把“用户请求某技能”“运行器注入了技能正文”“工具确实返回了文件内容”“已确认版本”建成独立事实。以 `provider/session/turn/call` 和原始引用建立关系。名称相同但路径、作用域不同的记录需要单独保留；跨轮或缺轮次保留未知。输出摘要和文件指纹采用不同字段，避免用最近一次扫描回填历史版本。

## 3. 数据库与事件模型

| 能力 | selftune 实际结构 | 对 AgentLens 的取舍 |
| --- | --- | --- |
| SQLite 操作数据 | Drizzle/Bun SQLite。canonical `sessions → prompts`、`skill_invocations`、`execution_facts`；调用有路径、版本、模式、可信度、`matched_prompt_id` 和 `raw_source_ref`。另存评估、基线、审计、纠正草案、库管理回执与 `analytical_import_checkpoints`。Codex 投影只填其中一部分。 | 复用现有 SQLite、事件偏移和投影。新增分析视图时把推断、人工标注、原始事实和可重建统计分表或分列。 [SQLite schema][sqlite] · [检查点][sqlite-checkpoint] |
| DuckDB 分析数据 | 存批次回执、span、metric、log、skill links、历史摘要/贡献和原始来源重建说明。Codex rollout 只投影一个 `trace_boundary=session` 的 `invoke_agent` span 及技能关联，要求正时间区间且有有效提示；没有逐工具 span 或完整正文。重建说明记录来源文件及 query 哈希、解析器版本和技能名输入；读取时验证精确字节，缺失、改变或版本证据不足时保留缺口。 | 借鉴版本化投影、批次回执和可复算来源。先测 SQLite 的真实瓶颈，再决定是否采用第二数据库。 [DuckDB schema][duckdb] · [Codex 分析投影][trace-projection] · [重建与摘要表][durable] |
| 提交与重放 | `makeLocalTraceImporterLive` 检查 SQLite checkpoint 与 DuckDB receipt，DuckDB 确认后确认检查点；canonical 与分析写入可重试，属于双存储确认过程。测试检查跨库确认、追加及同大小且 mtime 恢复的替换。JSONL 兼容层和恢复材料与事实库区分。 | 保留单库事务。AgentLens 当前指纹未对该同大小/恢复时间场景宣称等价保证。 [importer][importer] · [跨库源码测试][sync-test] · [架构][architecture] |

## 4. 功能对照矩阵

“已实现”指找到可达入口及业务路径；“部分实现”包括受限平台、粒度或仅有部分证据；“未实现”表示当前库未找到对等能力；“数据不可获取”指指定采集路径缺必要字段；“需要进一步验证”用于受本次静态范围限制的能力。下表的 selftune 测试引用表示核对源码断言，并非运行结果。

| 功能 | selftune 及验证点 | AgentLens 当前实现 |
| --- | --- | --- |
| Codex rollout 导入 | **已实现**。增量文件指纹、UTC 发现、边界解析、canonical 与分析投影。 [适配器][source-sync] · [输入边界][boundary-test] · [同步测试][sync-test] | **已实现**。`src/logs.rs` 的 `roots、ingest_batch、codex` 和 `src/logs/insights.rs::index`。支持 sessions、归档目录、额外目录，按字节游标处理。 |
| Session / Turn / Tool / Skill 关联 | **部分实现**。Codex 会话和首提示关联，每技能名汇总，输出证据有 call ID；DuckDB 还是会话跨度。 [canonical][rollout-canonical] · [版本证据测试][read-evidence-test] | **已实现**。 `parse / timeline / project_session` 保留可用 turnId、call ID、源/结果字节偏移；没有可用轮次时按原事件保留，子智能体关系依记录。 |
| 显式 Skill 选择 | **部分实现**。明确短语与路径可识别，名称需要在清单中；解析和 canonical 的 explicit/implicit 含义不同，可能将路径引用计为调用。 [检测][rollout-detection] · [明确提及测试][explicit-test] | **已实现**。 `skill_evidence` 识别类型为 `user.text` 的前置选择链接；与同路径、同轮注入证据合并。其它自然语言目前不自动归为已确认。 |
| Agent 自主选择及文件读取 | **部分实现**。部分 harness Hook 有模式分类；Codex 的推断标签和路径规则不能确认自主选择。 `call_id` 能绑定有限工具输出。 [读取收集器][read-evidence] · [统一分类][normalization] | **数据不可获取**（本次 Codex 样本的自主选择原因）。类型化注入保留 `unknown`，文件及脚本引用为 `candidate`；原调用参数、结果可复核。 |
| Skill 漏触发 | **部分实现**。`extractFailurePatterns` 取 `should_trigger`，剔除同文本的高可信正例，按调用类型聚类；已检查但未触发、全局文本 unmatched 和真实漏触发是不同统计。Claude 的只读浏览也可产生 false 记录，Codex 这条导入生成的调用行则为 true。真实漏触发需预期标签。 [规则][misses] · [断言][misses-test] · [状态口径][status] · [Claude 浏览记录][claude-read-model] | **未实现**。未观察到使用只对应选定范围；缺少“该任务应当调用”与覆盖充分的标注。 |
| 用户纠正发现 | **部分实现**。本地路由接 `discoverExplicitCorrectionSignalPage`，按 SQLite prompt 游标查同会话 30 分钟内技能，过滤首条 `p0` 与泛指令，英文规则＋精确路径编辑、明确补丁或 Hook 前后哈希。多候选或缺 hash 保留待审。仅依赖 Codex 该批量投影的 p0 无法覆盖后续纠正。 [信号实现][correction] · [纠正测试][correction-test] | **部分实现**。人工反馈可关联会话、轮次、偏移及版本，可以修订、删除；还没有人工介入候选发现和处置看板。 |
| 技能发现、作用域与去重 | **已实现**。目录和工作区祖先、范围分类、保留逻辑安装路径及 symlink target；按路径去重，日志 matcher 单独用名称 Set，查找有目录顺序。 [发现][discovery] · [优先级测试][discovery-test] | **已实现**。 `registry::roots/discover/scan_roots`；用户、系统、管理员、项目及插件缓存路径，发现不代表运行时已启用，跨别名及同名需要分别解释。 |
| Skill 内容版本与快照 | **已实现**。 `createSkillRevisionHistory.capture/diff/restore` 在规范化包路径记录不可变版本、捕获时双读和完整性校验；恢复有预期当前哈希和暂存交换。历史工具输出 hash 另存。 [版本服务][revisions] · [版本测试][revisions-test] | **部分实现**。按路径对受限 UTF-8 文件集合生成 SHA-256 本地快照，可查看和对比；历史调用没有可靠的完整包版本链接，也未做恢复。 |
| 评估集生成 | **已实现**。 `eval generate → buildEvalSet` 从 SQLite/自定义日志构建、去重、种子控制；选择高可信正例，其他观测查询是弱负例，兜底通用负例的 `source=log` 容易误读。显式开启合成/混合才需模型。 [生成入口][eval-cli] · [构建][eval-builder] · [边界测试][eval-builder-test] | **未实现**。已有人工反馈及执行证据，可作为人工审核样本的输入。 |
| Skill 执行效果评估 | **已实现**。 `gradeSession → runPreGates` 可直接处理明确条件；未决且有转录才交 agent judge。 `eval run` 另做实际产物交叉评估。实验分支 `execution-eval` 的机械项只实现文件存在/包含，命令输出等类型明示未支持，未找到通用 CLI 路由接入此分支。 [grade][grade] · [产物评估][quality] · [产物测试][quality-test] · [实验分支][experimental-eval] | **部分实现**。已有会话检查记录和退出码，没有用例定义、跨会话判定或质量评分。 |
| 无 Skill 基线 | **已实现**，有三种强度。 `eval/baseline` 是有/无描述的模型路由判断；常规 `eval run` 在不同目录跑产物且无技能臂使用提示约束和省略正文；受限的历史三臂回放明确不铺设目标 Skill、另有 Codex 专用验收器。三者都可能调用已安装的 Agent。 [路由基线][baseline] · [基线测试][baseline-test] · [产物评估][quality] · [历史三臂][historical-replay] · [三臂测试][historical-replay-test] | **未实现**。手动挑选历史对照可作为观察性比较；缺乏同输入的受控无技能试验。 |
| 历史会话 replay | **已实现**。历史 backfill 无 LLM；`runReplayValidation` 需要 fixture 和 runner，真实 replay 在暂存环境调用宿主 Agent；历史证据恢复依赖约束和原始文件校验，不能任意重放一切会话。 [回放引擎][replay-engine] · [宿主回放测试][replay-test] · [历史候选][historical-candidate] · [精确来源重建][source-reconstruction] | **部分实现**。时间线回放及观察已有事件；没有主动调用宿主重新执行，也没有并排路径比较。 |
| 优化候选生成及验证 | **已实现**，受目标和验证器覆盖约束。 `evolve/orchestrator` 从失败样本生成候选，judge 或试验回放验证；`--dry-run` 在验证之后阻止写入，不能视为零模型调用。历史候选另有校准、受控比较及无胜者结果。 [evolve][evolve] · [验证分流][validate] · [候选及校准][historical-candidate] | **未实现**。反馈和版本快照仍可供人工对照。 |
| 部署、备份与回滚 | **已实现**于明确路径。描述部署备份 `.bak` 后写并记审计；指定提案的撤回可从审计还原描述。版本恢复和 Skill Set 安装回执为独立实现。其他变异入口的备份一致性**需要进一步验证**，例如 body/routing 可直接写入。 [描述部署][evolve-deploy] · [回滚][rollback] · [回滚测试][rollback-test] · [安装回执][receipts] · [body 写入][evolve-body-write] | **未实现**。AgentLens 只读发现；比较历史文本和保存快照。 |
| Skill Sets 与项目级管理 | **已实现**。`manifests` 构建项目清单和捕获，`hash/storage` 存内容寻址包，`planning/receipts` 生成计划、处理冲突、限定路径并按回执撤回；不用 LLM。 [项目清单][skillsets] · [计划][skillsets-plan] · [回执][receipts] · [Skill Sets 测试][skillsets-test] | **部分实现**。能按项目发现、分析，技能当前作用域可见；未维护组合、安装或 managed links。 |
| 历史工作流与新 Skill 候选 | **已实现**。 SQLite 历史进入 `discoverWorkflows`，按时间序列、重复频率和错误聚合；`generateSynthesisCandidateSnapshot` 对历史生成候选清单，草稿可含确定性模板及留出样本。进一步执行评估、生成优化与发布是后续路径。 [工作流][workflows] · [候选][synthesis] · [候选测试][synthesis-test] | **部分实现**。 `dashboard` 有同轮 Skill × MCP 共现及关联项目。没有顺序模式、人工确认候选或样本外验证。 |
| SQLite / DuckDB | **已实现**。职责及两个检查阶段见第 3 节，存在 Codex 分析集成测试。 [集成测试][duckdb-test] | **已实现**（单库方案）。 `sources/events/catalog` 和 `insight_calls/checkpoints/feedback/skills/versions` 使用同一 SQLite，DuckDB 未引入。 |

### AgentLens 本机证据

- **应用投影。** `cargo test --offline --locked real_local_insights_smoke -- --ignored --nocapture` 实际通过。按修改时间取最近、单个小于 8 MiB 的最多 36 个 Codex 文件。临时库得到 170 个技能文件条目、3 条显式选择、0 条触发未知、15 条候选、20 条 MCP 调用、5 个 MCP 配置、0 个解析异常。发现文件数带同名/别名和缓存口径，不能等同于当前 Agent 可用的独立技能数。 [本机测试](../src/logs/insights.rs#L920)
- **直接读原始 JSONL。** 独立扫描同样的目录、大小和最近 36 文件规则，见 201 条 `turn_context`、198 条 `task_started`、189 条 `task_complete`、11 条 `turn_aborted`、501 条 `token_count`、543 条 custom tool call 和 543 条 custom tool output、70 条 function call 和 79 条 function output，0 行 JSON 解码失败。调用和结果总数不构成逐条配对证明，仍要按 session/call ID 验证。原始扫描发现 `skills.selected_skill_instructions` 两处，应用层计数经过证据合并且不保证同一采样瞬间。
- **可用配置。** 201 条 `turn_context` 均带 `turn_id/cwd/model/approval_policy/sandbox_policy/permission_profile/collaboration_mode`，其中 178 条有 `effort`。当前 AgentLens 的该分支只保留模型和通用轮次元数据。观察到的字段存在于这批日志，实施时需按数据类型和来源版本验证其内容，尤其不能按字段名把策略设置当成一次批准或拒绝。 [AgentLens Codex 解析](../src/logs.rs#L546) · [事件规范化与 Turn ID](../src/logs.rs#L706)
- **可用上下文边界。** 第二次独立扫描的样本随活跃日志变化，见 4 个 `response_item/compaction`，以及 527 个包含 `total_token_usage`、`last_token_usage` 和 `model_context_window` 的 `token_count.info`。这证明部分日志可提供压缩标记和 usage 计数。没有验证这些字段能直接计算实时上下文占用或每类消息的精确 token 数。普通 rollout 不提供可任意还原的实际 HTTP 请求体。现有 Codex Trace 读取用户选定的录制包，原始请求按需加载，Desktop 能否产生该包没有在本次调研验证。 [用量提取](../src/logs.rs#L476) · [Trace 页面](../ui/trace.js#L15) · [Trace 读取](../src/trace.rs)
- **现有产品基础。** `timeline` 已有关联的命令结果、文件记录、模型诊断、部分子智能体记录，`ui/diagnostics.js` 已有失败、相关改动、检查及报告，`ui/requests.js` 是已记录参数的请求证据分类。Skills Studio、MCP Studio、反馈和 Insights 已接真实 SQLite；能按证据跳转，MCP 分析默认展示参数及结果形状并保留运行状态未知。 [时间线](../src/logs.rs#L997) · [排查页](../ui/diagnostics.js#L78) · [数据投影](../src/logs/insights.rs#L541) · [Studio](../ui/insights.js#L634)

上述样本按最近修改和文件大小选择，活跃会话会改变结果，统计不可用于推算其他版本、平台或全量使用率。这次未读取实际用户数据库、浏览器凭据或外部服务，也未展示日志正文、技能正文或完整本机日志路径。

## 5. 可借鉴模块与许可证

| 模块 | 可借鉴的实现方式 | 适配边界 |
| --- | --- | --- |
| `rollout-line-scanner`、封装过滤、格式版本化 | 有界行流、可取消、按解析器版本触发重建。建立引用和正文的边界夹具。 | Rust 直接复用 AgentLens 的字节偏移读取，不能沿用首提示归因或把工具路径引用当触发。 [扫描器][scanner] · [Codex 解析][rollout-parse] |
| `skill-read-evidence`、查询与版本证据 | 精确 call ID、唯一文件、内容摘要、原始记录引用和可识别的证据范围。区分包哈希、文件哈希、工具输出哈希。 | 工具输出可能有前缀、截断或错误文本。只有清晰解析出完整内容并与对应文件匹配才确认文件版本。 [证据][read-evidence] · [断言][read-evidence-test] |
| `signal-discovery`、`extractFailurePatterns` | 负证据排除、按规范化事实去重、审阅候选、不确定原因和持久游标。 | 中英规则独立实现；人批准、拒绝、取消与文字纠正拆为不同事件。 [纠正][correction] · [漏触发规则][misses] |
| `workflow-discovery`、`execution-patterns` | 对重复序列和错误集群列样本、来源和计数；标出共现关系。 | AgentLens 以工具／文件／检查／人工介入为序列粒度，先不生成或部署技能。 [工作流][workflows] · [执行模式][execution-patterns] |
| `skill-revision-history`、重建说明 | 把读取时的证据与后来的文件变化区分开，并在新查询上暴露版本未知或源已变。 | 只读采证。恢复和应用候选属于后续独立授权范围。 [快照][revisions] · [重建说明][durable] |

上游根许可证允许使用、修改与分发；如果复制或移植其代码的实质部分，需附原版权和 MIT 许可文本。若引用第三方依赖或素材，核对各自许可。本阶段仅做研读与链接，未引入任何上游源码或依赖。推荐 Rust 侧独立实现，通过能运行的模拟与私有样本验证，而非直接搬入 Bun/Effect 或双数据库。 [许可证][license]

## 6. 无额外模型调用的差异化路线

首版统一读本机已有证据，用可复查规则和人工判定。建议最小事实合同 `provider / session_id / turn_id? / call_id? / source_ref / timestamp? / evidence_kind / confidence / missing_reason?`。会话归属和轮次缺失可显示；原始数据可按权限进入已有详情，列表和主动分享维持最小披露。优先复用现有 Rust 解析、SQLite 投影、时间线、排查和反馈，不要求安装 Hook、启动代理或发送模型请求。以下成本为相对估算，小约 1–2 人日、中约 3–5 人日、大约 6–10 人日，包含最小桌面 UI 与自检。

| 功能 / 优先级 | 用户价值和可行性 | 数据依赖及可复用程度 | 竞品重叠 / 成本 | 独立验收标准 |
| --- | --- | --- | --- | --- |
| **Agent Doctor / P0** | 会话页首屏列出首个可证实失败、高影响中断、同轮重试、最终检查与采集缺口。可先做确定性规则及导航。 | `task/turn` 边界、call ID、状态、退出码、文件路径；高复用 `timeline`、Trace 和 `diagnostics`。 | 中。selftune 有 doctor、last 和评分，AgentLens 深入每个执行步骤及子会话。中。 [selftune 命令][readme] | 失败后成功重试、取消、结果缺失、已有 Trace 未关联各用例分开；每条诊断均可定位证据，跨轮同命令不得误配。 |
| **Human Intervention Analysis / P1** | 按轮看哪里出现用户纠正、手动接手、明确拒绝或中途取消；用语句规则只生成可确认候选。 | 人类消息角色、轮次、时间、显式动作、反馈；高复用反馈、时间线。批准/取消的执行者需要记录，缺失留未知。 | 中高。selftune 已有与 Skill 绑定的纠正候选及学习，差异是双语、全工作流和人工操作归因。中。 [纠正][correction] | 首轮任务指示、转引错误文案、Agent 自己重试均不得算已确认人工介入；候选可确认/驳回且重建后去重，批准策略与批准事件分别展示。 |
| **Context Inspector / P1** | 看提示、工具定义、工具输出、技能、压缩等已记录组成和时序，协助排查上下文膨胀。 | 类型化内容、usage、模型窗口、压缩事件；可选 Trace 请求包。中复用既有使用量、trace viewer 和内容类型。 | 低到中。selftune 有 token 和会话分析，所审计的 Codex span 没有请求内容。大。 [Codex 投影][trace-projection] | 有 Trace 展示对应请求的实际组成；无 Trace 明示可用范围。缺失字节不补齐，字符数与 token 分开，累计快照不得相加。 |
| **Agent Configuration Impact / P1** | 看哪一次运行改变了模型、推理配置、沙箱或批准策略，再审视相关失败和等待。 | 按轮次解析验证过的 `turn_context` 字段；Git 提交有记录才作基线。中复用模型诊断和 Execution Diff。 | 中。selftune 有 Skill Set 前后结果、会话级配置摘要；AgentLens 侧重逐轮配置差异。中。 [Skill Set outcomes][outcomes] · [解析][rollout-parse] | 同会话中途变更只显示在相关轮次；缺失字段留未知；按项目/模型分层汇总，展示样本数和缺口，避免将观察性差异标成因果。 |
| **Execution Diff / P0** | 手选失败与成功轮次，并排定位分歧在什么请求、工具参数、工作目录、改动或检查。 | 已配对的会话步骤、工具类别、命令及 cwd、结果；高复用时间线、诊断逻辑和快照 UI。 | 中。selftune 有主动对照回放，AgentLens 做已有会话跨平台执行对照。中。 [宿主验证][replay-engine] | 以稳定顺序和规范化签名对齐，同一工具重复调用也不混配；增删、变化、证据缺失分别标识，两列均可跳回源，打开对照不执行任何命令。 |
| **Skill 版本真实效果追踪 / P2** | 对使用同一技能不同已验证版本的历史任务对比退出码、重试、人工纠正与资源指标。 | 需确切版本证据、任务分组和评价分母。中复用版本、反馈、按项目分析；无版本关联的历史必须保留未知。 | 高。selftune 有基线、版本、校准和回归；AgentLens 优先做项目实际运行的可审计覆盖。大。 [版本][revisions] · [历史候选][historical-candidate] | A→B→A 能区分观测时间；当前版本不回填历史；只对已证实样本分组，分母及未知样本公开；样本过少显示不足。 |
| **MCP 工具调用质量 / P1** | 看哪些服务或工具经常失败、超时、重复调用，改为人工从原始结果判定业务成功。 | 已确认的 call、status 或 `isError`、耗时、时间窗、可能的故障证据；高复用 MCP Studio 的统计、结果与源跳转。 | 低到中。selftune 该 Codex 适配器只计 MCP 类工具总数，未看到等粒度的 server/tool 质量路径。中。 [解析][rollout-parse] | 同名工具按 server 分离；并行调用按 ID，未知不算成功；有结果但无可验证业务成功条件时显示仅有工具执行状态；延迟只统计有记录样本。 |
| **历史工作流机会 / P2** | 提出可复核的重复重跑、重复读取、固定修复序列及检查缺失，供人审阅改成流程或 Skill。 | 正确排序的工具/文件/检查/介入、原始证据、项目和持久化规则；中复用 Insights、反馈，并以历史比较验证。 | 高。selftune 已做技能序列、重复错误与候选，AgentLens 可切到完整轨迹和历史缺口。大。 [执行模式][execution-patterns] · [合成候选][synthesis] | 同一日志副本只计一次；至少 3 个不同会话才显示候选，可打开实际支持和反例；不把重复路径归因于某个模型或 Skill，建议由人工采纳。 |

## 7. 开发任务与顺序

- **P0 · 证据与排查。** 建立只读的证据可用性结果，区分日志未发现、Trace 文件已发现/待选择、Trace 是否能关联。给会话排查加入失败／取消／疑似缺结果摘要和源跳转。实现手选两轮的 Execution Diff，覆盖并行、截断、重试和子会话；用最小真实样本及合成边界夹具验收。交付标志是一条失败会话可从原始证据、对照片段到人工反馈走完。
- **P1 · 人工介入、配置与工具。** 先将已有反馈接到介入入口，加入中文、英文可确认候选。保留按轮配置及可解释上下文边界；按实际支持的 Trace 附件展示请求组成。MCP 中心新增每个工具的可复核结果口径、延迟分母和错误归档。任何“漏触发”先做人工指定预期，再检查对应轮次覆盖。
- **P2 · 基于证据的回归和改进。** 人工把反馈保存为检查条件，用历史运行做通过、失败或证据不足三态校验。展示已验证版本的观察性对照，提炼重复工作流和反例。主动重跑、自动生成、安装部署或恢复 Skill 需要另行审议。

## 8. 已验证、未验证和风险

- **已验证。** pinned 源码的本地导入、Codex 证据口径、SQLite/DuckDB、工作流发现、评估／部署入口和测试边界有对应实现；本机 AgentLens Rust 真实日志测试通过，确认存在逐轮配置、部分压缩及使用量字段。热度、准确率和版本收益没有在调研中测量。
- **需要进一步验证。** 不同版本 Codex Desktop 的实际 Hook 和 Trace 启动支持、运行器对自主选用 Skill 的显式因果字段、批准动作是否有独立可靠事件、跨模型 Token 口径。对存在但语义未确认的字段，先做最小受控样本并记录来源版本。
- **缺失与偏差。** 多轮用首条 query 归因、同步中断、来源文件变化、日志轮转、日志副本、作用域漂移、时间窗共现、用户取消与 Agent 失败混淆均会产生误判。首先依据完整来源 ID 和显式关联，关键缺口用 Unknown 说明具体原因。
- **质量指标边界。** 无调用记录可能是缺日志；路由命中、协议执行成功和用户任务完成分别有各自的分母。真实版本或配置效果受项目、模型、任务难度和采集范围影响；未控制时只呈现观察结果。
- **性能与隐私。** 历史索引先复用 SQLite，不复制原始请求正文；打开详情时按需读有限记录。源索引存偏移与摘要，文件变更要重新验证。敏感路径、错误串、配置和模型上下文仅在明确进入详情时按现有本地规则展示，导出默认最小披露。

**建议确认的下一阶段**是 P0。先交付「打开失败会话 → 定位具体步骤 → 和成功执行对照 → 保存人工反馈」的完整路径。AgentLens 的长期差异化在于可复核的真实执行链，Skill 成效、MCP 质量和工作流发现都可以沿用这套证据基础。

## 9. 从用户会话生成评估集与金标集

### selftune 的三个入口

1. **本机生成触发评估集。** `runEvalGenerate → buildEvalSet` 默认读本机 SQLite，亦可读取指定 JSONL。规则从高可信触发提取正例，排除重复，加入其它未匹配请求作为弱负例，并用固定种子抽样。产物是带 `query/should_trigger/invocation_type` 等字段的样本。默认生成流程不需要把会话发给 AI，合成和混合选项才调用模型。未匹配请求和兜底通用负例都需要人工复核，当前代码甚至会把通用负例标成 `source=log`。 [评估生成源码][eval-builder] · [样本筛选测试][eval-builder-test]
2. **使用者贡献给作者。** `runContribute → assembleBundle → sanitizeBundle` 生成可预览的 JSON，包含摘出的请求、触发用例和会话/评估摘要等，显式提交才走外部服务或 GitHub。还有使用者向作者提供的窄版信号，只传触发模式、类别或成绩桶等数据。前者可以带较多文字，其 unmatched 查询取自整个本地 query 范围，待处理提案还可能包含其它 Skill。脱敏不等于范围授权，AgentLens 应定向选轮次和字段。 [贡献内容][contribution-bundle] · [预览与提交][contribution-program] · [作者信号][contribution-signals]
3. **效果评价和回归。** `gradeSession` 对能验证的条件先用规则，余下需有原始证据才调用 Agent 判定。历史候选按精确版本和原始来源分出校准、候选选择和最终留出，并要求至少 3 个不同的可解析任务才进入其后续流程；这个门槛不是准确率保证。纠正研究另有证据、重复对照和晋升条件。 [分级评估][grade] · [历史留出分组][historical-holdout] · [纠正研究][correction-study-eval]

### AgentLens 建议的作者—使用者流程

1. **从指定 Skill 自动找出可选案例。** 使用者打开「Skills Studio → 某个 Skill → 评估样本」。软件复用调用索引，优先按规范化 Skill 路径区分同名技能，按会话和轮次分组，使用调用 ID 或源日志偏移定位证据。列表默认只显示该 Skill 已确认调用的片段，每条预览同轮请求、触发证据、相关工具结果及已记录的失败或纠正。使用者勾选要贡献的案例。找不到明确轮次时，只显示可证实的调用附近记录并标明上下文缺失。弱关联、同名歧义和疑似漏触发进入该 Skill 的独立待核实列表，由明确提及或已有人工反馈提供关联依据，确认前不进入正式样本。 [现有调用索引](../src/logs/insights.rs#L176)
2. **生成候选草稿。** 用规则填入技能身份、可确认版本、原请求、实际观察、证据完整性与作者需要核对的信息；预期行为由人补充。可选 AI 整理仅在明确提交已预览片段后运行，帮助提炼失败点、删去无关内容或起草断言。AI 草稿进入待审，保留真实摘录与改写的来源区别。原始隐私使案例无法复跑时，可另建一个标明为派生的最小可复现输入。
3. **导出最小证据包，作者导入。** 用户逐条预览并确认发送给谁。导出带版本的可移植 JSON，作者按仓库/包身份及确认过的版本聚合，版本未知留空。本地完整日志保持原样。默认导出只含选定的脱敏片段或重述、可移植样本 ID、验收条件及证据范围；完整会话、绝对路径、凭据和未选项目内容不随包携带。作者端按样本 ID、来源分组及近重复提示合并。
4. **人工确认后形成评估集与金标集。** 作者确认「应触发／不应触发／不确定」与「触发之后怎样才算做对」，用户的实际观察独立保存。金标样本必须有明确预期和可执行断言或人工评分准则；缺证据或作者/使用者仍有分歧就留在候选。按原会话和同一问题家族分组，避免原例和改写落入不同集。保留一组冻结金标用于发布前评估，开发集用于调整 Skill；留出集被反复用于调参时补充新案例。真实覆盖不足时注明样本数与来源。
5. **迭代前后用同一集验证。** 第一版在本机用历史证据判定退出码、文件路径或操作顺序，输出通过、失败、证据不足。后续若做新版本真实重跑，则固定输入、初始文件、Agent/模型配置、Skill 指纹和判定标准，用隔离工作目录运行。在明确控制后才能声称是版本之间的对照。触发误判与执行断言分开计数。

建议导出结构中分开 `input`、`observed`、`expected`、`checks`、`source`、`review` 和 `split`，避免根据旧版观测直接写出期望。最小实例为演示，非采集样本：

| 类别 | 真实观察应记录什么 | 人工金标应确认什么 |
| --- | --- | --- |
| 应触发却未观察到 | 用户说“帮我整理一页周报”，对应轮没记录目标 Skill 触发，采集有覆盖边界 | 需求确实属于周报 Skill；应触发。若证据不够，只能留下漏触发候选。 |
| 触发但执行不符 | Skill 注入已记录，文件已写出，但用户要求补回状态和负责人 | 输出必须包含“事项、状态、负责人”；固定测试数据，检查表格列和非空约束。 |
| 不应触发的相近请求 | 用户问“周报放在哪个目录”，可能曾加载模板 | 这是定位文件的请求，应该返回位置；不应创建新周报。 |

**建议插入 P1 的最小版本。** 先完成「选中 Skill → 自动列出相关调用片段 → 勾选案例 → 本地导出 → 作者导入并标注 → 导出评估集」。P2 增加按同输入和配置的重复对照及发布前金标报告。验收需覆盖同名不同路径、多 Skill 同轮、重复日志、证据缺失、误触发及已触发但结果错误。两个 Skill 共享一轮时，只提取各自可归属的证据，并标出共享上下文。未确认的漏触发保留在待核实列表，导入导出保留证据和审核状态。首版可用本机规则和人工审核，AI 作为后续可选整理器。

[commit]: https://github.com/selftune-dev/selftune/commit/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4
[manifest]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/package.json#L1-L38
[license]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/LICENSE#L1-L21
[readme]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/README.md
[architecture]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/ARCHITECTURE.md
[roadmap]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/ROADMAP.md
[prd]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/PRD.md
[sync-command]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/apps/cli/src/effect-cli/commands/sync.ts#L85-L123
[source-sync]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/source-sync.ts#L101-L268
[rollout-find]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/ingestors/codex-rollout.ts#L95-L175
[scanner-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/ingestors/rollout-line-scanner.test.ts#L27-L54
[rollout-parse]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/ingestors/codex-rollout.ts#L437-L645
[rollout-canonical]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/ingestors/codex-rollout.ts#L773-L878
[rollout-tests]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/ingestors/codex-rollout.test.ts#L195-L307
[rollout-detection]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/ingestors/codex-rollout.ts#L316-L407
[normalization]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/normalization.ts#L465-L499
[explicit-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/ingestors/codex-rollout-explicit-skills.test.ts#L26-L54
[read-evidence]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/ingestors/skill-read-evidence.ts#L11-L65
[read-evidence-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/ingestors/codex-version-evidence.test.ts
[hook]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/adapters/codex/hook.ts#L62-L227
[wrapper]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/ingestors/codex-wrapper.ts#L406
[sqlite]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/local-store/src/drizzle-schema.ts#L26-L161
[sqlite-checkpoint]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/local-store/src/drizzle-schema.ts#L896-L912
[duckdb]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/observability/src/duckdb-store.ts#L467-L573
[trace-projection]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/ingestors/codex-trace-projection.ts#L31-L114
[durable]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/observability/src/durable-summary-sql.ts#L1-L104
[importer]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/orchestration/src/sync/local-trace-importer.ts#L274-L324
[sync-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/ingestors/codex-source-sync-analytics.test.ts#L169-L278
[boundary-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/ingestors/codex-input-boundary.test.ts#L31
[misses]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/evolution/extract-patterns.ts#L101-L149
[misses-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/evolution/extract-patterns.test.ts#L100-L222
[status]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/status.ts#L148-L194
[correction]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/correction-study/signal-discovery.ts
[correction-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/apps/local/tests/correction-signal-discovery.test.ts
[discovery]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/utils/skill-discovery.ts#L128-L242
[discovery-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/utils/skill-discovery.test.ts
[revisions]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/skill-revision-history.ts#L114-L228
[revisions-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/apps/local/tests/skill-revision-history.test.ts
[eval-cli]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/apps/cli/src/effect-cli/commands/eval.ts#L64-L153
[eval-builder]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/eval/hooks-to-evals.ts
[eval-builder-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/eval/hooks-to-evals.test.ts
[grade]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/grading/grade-session.ts#L637-L710
[quality]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/eval/output-quality.ts#L318-L470
[quality-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/eval/output-quality.test.ts
[experimental-eval]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/eval/execution-eval.ts#L72-L169
[baseline]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/eval/baseline.ts#L64-L138
[baseline-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/eval/baseline.test.ts
[historical-replay]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/apps/local/src/historical-skill-replay-executor.ts#L420-L557
[replay-engine]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/evolution/engines/replay-engine.ts#L118-L178
[replay-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/evolution/validate-host-replay.test.ts
[historical-candidate]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/apps/local/src/historical-task-candidate.ts
[evolve]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/evolution/evolve/orchestrator.ts
[validate]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/evolution/evolve/validation.ts#L84-L131
[evolve-deploy]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/evolution/evolve/orchestrator.ts#L905-L977
[rollback]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/evolution/rollback.ts#L102-L183
[rollback-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/evolution/rollback.test.ts
[receipts]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/library/src/receipts.ts
[skillsets]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/library/src/manifests.ts#L223-L362
[skillsets-plan]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/library/src/planning.ts#L34-L110
[skillsets-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/skill-sets/skill-sets.test.ts
[workflows]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/skill-intelligence/src/workflow-discovery.ts#L34-L183
[synthesis]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/synthesis.ts
[synthesis-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/library/synthesis.test.ts
[duckdb-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/tests/observability/codex-duckdb-dashboard.integration.test.ts
[scanner]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/harnesses/codex/src/ingestors/rollout-line-scanner.ts
[execution-patterns]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/skill-intelligence/src/execution-patterns.ts#L86-L114
[outcomes]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/skill-intelligence/src/outcomes.ts#L179-L267
[historical-replay-test]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/apps/local/tests/historical-skill-replay-executor.test.ts
[source-reconstruction]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/orchestration/src/reconstruct-source-task.ts#L11-L53
[claude-read-model]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/utils/transcript.ts#L135-L174
[evolve-body-write]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/evolution/evolve-body.ts#L706-L745
[contribution-bundle]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/contribute/bundle.ts#L191-L312
[contribution-program]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/contribute/program.ts#L241-L329
[contribution-signals]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/runtime/contribution-signals.ts#L102-L174
[historical-holdout]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/apps/local/src/historical-task-candidate.ts#L302-L333
[correction-study-eval]: https://github.com/selftune-dev/selftune/blob/5335ce6a6e5469b2adf57bdb8035a6f3461a76a4/packages/skill-intelligence/src/correction-studies.ts#L185-L261
