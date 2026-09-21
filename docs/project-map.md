# Project map

This is a short map of the version-controlled project. Each leaf has a one-line
description. Generated or machine-local directories are listed separately so
they are not mistaken for source code.

```text
ollama-mcp-server/
|-- .env.example                 Example Ollama, experimental, and autonomous-tool settings.
|-- .gitignore                   Excludes dependencies, secrets, and generated data from Git.
|-- AGENTS.md                    Project instructions, architecture notes, and safety rules.
|-- CLAUDE.md                    Imports the shared project instructions for Claude Code.
|-- README.md                    Project overview, setup, available MCP tools, and quality CLI.
|-- package.json                 Node package metadata, dependencies, and npm commands.
|-- package-lock.json            Exact dependency versions installed by npm.
|-- tsconfig.json                TypeScript compiler configuration.
|-- .quality-review/             Existing sample quality-review state (normally machine-local).
|   |-- state.db                 SQLite queue, findings, and review-decision database.
|   `-- reports/                 Model-generated example review reports.
|       |-- runRead-qwen2.5-coder%3A7b-1.md First saved runRead review from Qwen 2.5 Coder 7B.
|       |-- runRead-qwen2.5-coder%3A7b-2.md Second saved runRead review from Qwen 2.5 Coder 7B.
|       |-- runRead-qwen2.5-coder%3A7b-3.md Third saved runRead review from Qwen 2.5 Coder 7B.
|       |-- runRead-qwen2.5-coder%3A7b-5.md Fifth saved runRead review from Qwen 2.5 Coder 7B.
|       |-- runRead-qwen3.5%3A4b-1.md First saved runRead review from Qwen 3.5 4B.
|       |-- runRead-qwen3.5%3A4b-2.md Second saved runRead review from Qwen 3.5 4B.
|       `-- runRead-qwen3.5%3A4b-3.md Third saved runRead review from Qwen 3.5 4B.
|
|-- src/                         Application source code.
|   |-- index.ts                 Starts the MCP server and registers its tools.
|   |-- config/features.ts       Validates centralized optional/experimental tool flags.
|   |-- config/features.test.ts  Checks defaults, overrides, dependencies, and worker isolation.
|   |-- ollama-client.ts         Shared HTTP client for Ollama generation, models, and embeddings.
|   |-- shell-allowlist.ts       Safe Git command parser and prompts for autonomous workers.
|   |-- tools/                   MCP tool definitions; each file registers one capability.
|   |   |-- run-ollama-task.ts   Sends a one-shot task to an Ollama model.
|   |   |-- summarize-output.ts  Summarizes logs or large text with Ollama.
|   |   |-- list-ollama-models.ts Lists locally available or signed-in Ollama models.
|   |   |-- local-explorer-task.ts Read-only model-driven repository exploration loop.
|   |   |-- run-local-worker-task.ts Opt-in local autonomous Git-task worker.
|   |   |-- run-cloud-claude-task.ts Opt-in Ollama-cloud Claude harness worker.
|   |   |-- outline-file.ts      Exposes a source file's indexed declaration outline.
|   |   |-- read-symbol.ts       Exposes one indexed symbol and its focused source context.
|   |   |-- structural-queries.ts Exposes indexed symbol, reference, caller, and callee queries.
|   |   |-- semantic-search.ts   Exposes embedding-based symbol search.
|   |   |-- hybrid-retrieval.ts  Exposes combined lexical, semantic, and structural retrieval.
|   |   |-- discover-evidence.ts Makes an unverified evidence-collection plan.
|   |   |-- verify-claims.ts     Classifies supplied claims against repository evidence.
|   |   |-- synthesize-verified-answer.ts Produces a cited answer from supported claims.
|   |   |-- save-knowledge-updates.ts Stores verified exploration knowledge safely.
|   |   `-- explore-repository.ts Runs the complete retrieve-to-verified-answer pipeline.
|   |-- quality-review/          Separate read-only code-quality review CLI.
|   |   |-- cli.ts               Parses quality CLI commands and prints results.
|   |   |-- scanner.ts           Finds JavaScript/TypeScript functions to review.
|   |   |-- reviewer.ts          Builds prompts and validates model review responses.
|   |   |-- service.ts           Coordinates scanning, reviewing, and report lifecycle.
|   |   |-- storage.ts           Stores review queue and decisions in SQLite.
|   |   `-- quality.test.ts      Tests the quality-review workflow and safety behavior.
|   `-- super-explorer/          Repository indexing, retrieval, verification, and CLI tools.
|       |-- indexer.ts           Builds a Tree-sitter-based repository and symbol index.
|       |-- outline-file.ts      Converts indexed symbols into a file outline.
|       |-- read-symbol.ts       Reads an indexed symbol's source range and context.
|       |-- structural-tools.ts  Finds symbols, references, callers, callees, and tests.
|       |-- semantic-search.ts   Builds and searches a local embedding index.
|       |-- hybrid-retrieval.ts  Fuses lexical, semantic, structural, docs, and Git evidence.
|       |-- discovery.ts         Uses a model to plan evidence collection.
|       |-- verification.ts      Materializes evidence and verifies individual claims.
|       |-- synthesis.ts         Turns supported claims into a concise cited answer.
|       |-- knowledge-store.ts   Persists verified knowledge and tracks its freshness.
|       |-- framework-adapter.ts Defines the interface for framework-specific facts.
|       |-- wordpress-woocommerce-adapter.ts Extracts WordPress/WooCommerce facts.
|       |-- git-history.ts       Looks up file and symbol history through Git.
|       |-- explore.ts           Orchestrates the end-to-end Super Explorer pipeline.
|       |-- baseline-benchmark-cli.ts Runs the baseline gold-set benchmark.
|       |-- hybrid-benchmark-cli.ts Measures hybrid retrieval against gold questions.
|       |-- gold-set-cli.ts      Runs selected Super Explorer gold-set questions.
|       |-- index-cli.ts         Command-line wrapper for repository indexing.
|       |-- outline-cli.ts       Command-line wrapper for file outlines.
|       |-- read-symbol-cli.ts   Command-line wrapper for reading symbols.
|       |-- structural-cli.ts    Command-line wrapper for structural queries.
|       |-- semantic-cli.ts      Command-line wrapper for semantic indexing and search.
|       |-- hybrid-cli.ts        Command-line wrapper for hybrid retrieval.
|       |-- discovery-cli.ts     Command-line wrapper for evidence discovery.
|       |-- verification-cli.ts  Command-line wrapper for claim verification.
|       |-- synthesis-cli.ts     Command-line wrapper for answer synthesis.
|       |-- knowledge-cli.ts     Command-line wrapper for knowledge updates and freshness.
|       |-- git-history-cli.ts   Command-line wrapper for Git-history lookups.
|       |-- wordpress-hooks-cli.ts Runs the WordPress/WooCommerce fact extractor.
|       `-- explore-cli.ts       Command-line wrapper for the full explorer.
|
|-- scripts/                     Benchmark runners and a cloud-worker safety hook.
|   |-- validate-cloud-bash.cjs  Re-validates cloud-worker Bash commands for safety.
|   |-- run-matrix-supervised.sh Starts and monitors a detach-safe benchmark matrix.
|   |-- run-super-explorer-matrix.sh Runs selected Super Explorer benchmark cases.
|   |-- run-explorer-scout-benchmark.ts Benchmarks the read-only local explorer.
|   |-- run-capability-matrix-f1.cjs Runs the F1 capability fixture.
|   |-- grade-capability-matrix-f1.cjs Grades F1 results in an isolated harness.
|   |-- run-capability-matrix-phase3.cjs Repeats finalist tests to check reliability.
|   |-- run-capability-matrix-phase4.cjs Runs held-out confirmation fixtures.
|   |-- run-capability-matrix-track-b.cjs Runs tool-driven benchmark fixtures safely.
|   |-- run-capability-matrix-u1-c1.cjs Runs U1 and C1 capability fixtures.
|   |-- run-capability-matrix-i1-r1-s1.cjs Runs I1, R1, and S1 capability fixtures.
|   |-- run-capability-matrix-i1-predict16k.cjs Retries I1 with a larger output budget.
|   `-- run-capability-matrix-exaone-f16.cjs Probes Exaone with an f16 KV cache.
|
`-- docs/                        Project documentation and benchmark records.
    |-- README.md                 Documentation index: begin here.
    |-- project-map.md            This project map.
    |-- agent-conversation.md     Notes on using the project through an agent conversation.
    |-- quality-review.md         User guide for the quality-review CLI.
    |-- cost-aware-agent-workflow.md Guidance for delegating work by cost and risk.
    |-- benchmarks/               Model measurements and their supporting runs.
    |   |-- README.md             Explains benchmark organization and data-retention rules.
    |   |-- MASTER.md             Current benchmark conclusions and routing recommendation.
    |   |-- model-classification.md Groups models by the tasks they handle well.
    |   `-- runs/                 Dated benchmark plans, outcomes, and JSON result records.
    |       |-- 2026-09-12-early-trials.md Initial pre-fixture model trials.
    |       |-- 2026-09-14-32k-context.md Earlier 32K-context experiment results.
    |       |-- 2026-09-14-agentic-delegation.md Autonomous Git-task experiment results.
    |       |-- 2026-09-15-16k-context.md 16K-context model comparison results.
    |       |-- 2026-09-15-8k-context-coder.md 8K-context coder-model experiment.
    |       |-- 2026-09-15-capability-matrix-plan.md Capability-matrix fixture and measurement plan.
    |       |-- 2026-09-15-new-models.md Screen of newly pulled models.
    |       |-- 2026-09-16-capability-matrix-results.md Measured task-by-task capability results.
    |       |-- 2026-09-16-local-explorer.md Pilot of the local repository explorer.
    |       |-- 2026-09-19-explorer-scout-comparison.md Explorer scout comparison and rerun.
    |       |-- 2026-09-19-sweep3-limit20-results.json Raw structured results for limit-20 sweep.
    |       |-- 2026-09-19-sweep4-limit40-qwen4b-results.json Raw Qwen 4B limit-40 sweep results.
    |       |-- 2026-09-19-sweep5-limit40-qwen2b-results.json Raw Qwen 2B limit-40 sweep results.
    |       |-- 2026-09-19-sweep6-retry-limit80-results.json Raw retry limit-80 sweep results.
    |       `-- 2026-09-20-local-worker-cost-flow.md Cost and flow analysis for local worker use.
    |-- planning/                 Strategy, proposals, and design experiments.
    |   |-- README.md             Index for planning documents.
    |   |-- cloud-strategy.md     Ollama cloud routing strategy.
    |   |-- explorer-finetune-plan.md Fine-tuned Explorer proposal and prerequisites.
    |   |-- improvements-backlog.md Open improvement ideas and unresolved issues.
    |   |-- local-claude-worker-experiment.md Full-harness autonomous worker experiment.
    |   `-- project-reality-check-2026-09-19.md Evidence audit and current project assessment.
    `-- super-explorer/           Design and benchmark documentation for Super Explorer.
        |-- README.md             Architecture, constraints, and delivery roadmap.
        |-- overview.md           Plain-language explanation of the subsystem.
        |-- benchmarks.md         Gold set, scoring rules, and recorded trials.
        |-- storage.md            Generated-data layout and lifecycle.
        |-- symbol-schema.md      Structural symbol-record schema and invariants.
        |-- knowledge-store-schema.md SQLite knowledge-store schema and freshness rules.
        |-- framework-adapters.md Generic framework-adapter design.
        `-- git-history.md        File and symbol Git-history lookup design.
```

## Local/generated directories

These may exist on a working machine but are not the core source tree:

- `node_modules/` — installed npm packages.
- `.env` — local environment settings; keep secrets out of Git.
- `benchmark-data/` — generated raw benchmark artifacts.
- `.super-explorer/` — generated repository indexes and knowledge data.
- `.quality-review/` — local quality-review SQLite state and reports.
- `.git/` — Git's own history and metadata.

## How to read the drawing

`|--` and `` `--`` mean “this item is inside the folder above it.” The vertical
`|` lines show that more items continue at that level. Indentation shows nesting:
for example, `src/tools/run-ollama-task.ts` is a file inside `src/tools/`.

The final item in a group uses `` `--`` simply to make the tree look neat; it
does not mean the item is less important.
