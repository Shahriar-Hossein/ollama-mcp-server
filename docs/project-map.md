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
|   |-- tools/                   Supported MCP tool definitions.
|   |   |-- run-ollama-task.ts   Sends a one-shot task to an Ollama model.
|   |   |-- summarize-output.ts  Summarizes logs or large text with Ollama.
|   |   |-- list-ollama-models.ts Lists locally available or signed-in Ollama models.
|   |   |-- outline-file.ts      Exposes a source file's indexed declaration outline.
|   |   |-- read-symbol.ts       Exposes one indexed symbol and its focused source context.
|   |   |-- structural-queries.ts Exposes indexed symbol, reference, caller, and callee queries.
|   |   `-- hybrid-retrieval.ts  Exposes deterministic basic retrieval by default.
|   |-- explorer/                Supported deterministic repository intelligence.
|   |   |-- README.md            Supported scope and experimental boundary.
|   |   |-- indexer.ts           Builds the Tree-sitter repository/symbol index.
|   |   |-- outline-file.ts      Converts indexed symbols into a file outline.
|   |   |-- read-symbol.ts       Reads one indexed symbol with focused context.
|   |   |-- structural-tools.ts  Finds symbols, references, callers, callees, and tests.
|   |   |-- retrieval.ts         Lexical/structural basic retrieval and gated hybrid mode.
|   |   `-- *-cli.ts             Supported Explorer command-line entry points.
|   |-- quality-review/          Separate read-only code-quality review CLI.
|   |   |-- cli.ts               Parses quality CLI commands and prints results.
|   |   |-- scanner.ts           Finds JavaScript/TypeScript functions to review.
|   |   |-- reviewer.ts          Builds prompts and validates model review responses.
|   |   |-- service.ts           Coordinates scanning, reviewing, and report lifecycle.
|   |   |-- storage.ts           Stores review queue and decisions in SQLite.
|   |   `-- quality.test.ts      Tests the quality-review workflow and safety behavior.
|   `-- experimental/            Parked advanced and autonomous work; default runtime skips it.
|       |-- README.md            Boundary and contents of the parked work.
|       |-- explorer/            Semantic, history, verification, knowledge, adapters, full pipeline.
|       |-- tools/               Optional MCP registrations and model-driven local explorer.
|       |-- workers/             Autonomous workers and their shared shell allowlist.
|       `-- benchmarks/          Super Explorer research entry points.
|
|-- scripts/                     Runtime safety support plus parked research scripts.
|   |-- validate-cloud-bash.cjs  Re-validates cloud-worker Bash commands for safety.
|   `-- experimental/            Historical benchmark runners and supervisors.
|
`-- docs/                        Project documentation and benchmark records.
    |-- README.md                 Documentation index: begin here.
    |-- project-map.md            This project map.
    |-- agent-conversation.md     Notes on using the project through an agent conversation.
    |-- quality-review.md         User guide for the quality-review CLI.
    |-- cost-aware-agent-workflow.md Guidance for delegating work by cost and risk.
    `-- experimental/             Parked research documentation.
        |-- benchmarks/           Historical model measurements and run records.
        |-- planning/             Strategy proposals and past experiments.
        `-- super-explorer/       Advanced Explorer design and benchmark research.
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
