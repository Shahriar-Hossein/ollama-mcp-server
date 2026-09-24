# ollama-mcp-server

A thin TypeScript MCP server for delegating bounded work to Ollama and for
inspecting repositories without spending the host agent's context on bulk work.
It runs over stdio with `npm start`; there is no build step.

For a concise orientation to the repository layout and the purpose of each
tracked file, start with the [project map](docs/project-map.md).

## Supported now

The default MCP surface is intentionally small.

### Basic Ollama tools

- `run_ollama_task` sends one stateless task to an Ollama model.
- `summarize_output` condenses large text through Ollama.
- `list_ollama_models` lists available local or signed-in models.

### Quality Review

The separate read-only CLI scans JavaScript/TypeScript functions into SQLite,
reviews a bounded queue, and saves reports under the target repository's
`.quality-review/` directory. It never changes target source files.

```bash
npm run quality -- scan --cwd /path/to/repo
npm run quality -- review --count 10 --cwd /path/to/repo
npm run quality -- status --cwd /path/to/repo
```

Findings can later be inspected and marked accepted or rejected; those decisions
are metadata only. See the [Quality Review guide](docs/quality-review.md).

### Lean Explorer

The default Explorer uses deterministic repository intelligence:

- `outline_file` and `read_symbol`
- `find_symbol`, `find_references`, `find_callers`, and `find_callees`
- `hybrid_retrieve` in `basic` mode, combining lexical and structural ranking
  with relevant documentation and package scripts

`basic` mode does not use embeddings or autonomous model planning. A client can
retrieve likely symbols, read focused source, and summarize the evidence. Use
`mode: "lexical"` for the narrow symbol baseline. `mode: "hybrid"` is available
only when semantic search and Git-history intelligence are enabled.

The supported implementation is isolated in `src/explorer/`. Advanced and
autonomous code is parked under `src/experimental/` and is not imported during
default startup.

Deterministic CLI entry points remain available, for example:

```bash
npm run index:super-explorer -- /path/to/repo
npm run hybrid:super-explorer -- basic /path/to/repo "where is config loaded"
```

## Experimental and disabled by default

Experimental code remains in the repository, but its MCP tools are not
registered unless enabled. `ENABLE_EXPERIMENTAL=1` enables all experimental
groups; a group-specific `0` can override the master flag.

| Flag | Enables |
|---|---|
| `ENABLE_SEMANTIC_SEARCH=1` | `semantic_search`; one prerequisite for full `hybrid_retrieve` mode |
| `ENABLE_GIT_HISTORY=1` | Git-history CLI/ranker; the other prerequisite for full `hybrid_retrieve` mode |
| `ENABLE_KNOWLEDGE_STORE=1` | `save_knowledge_updates` and `refresh_knowledge_freshness` |
| `ENABLE_VERIFICATION_PIPELINE=1` | `discover_evidence`, `verify_claims`, and `synthesize_verified_answer` |
| `ENABLE_FULL_EXPLORER=1` | `explore_repository`; requires the verification flag |
| `ENABLE_LOCAL_EXPLORER_TASK=1` | `local_explore_repo` deterministic-first scout and legacy `local_explorer_task` tool loop |
| `ENABLE_FRAMEWORK_ADAPTERS=1` | framework-adapter CLI entry points |

`local_explore_repo` is the preferred model-backed scout. It retrieves up to
8–12 basic candidates, adds bounded caller and source-text context, and sends
excerpts from at most six files to `qwen3.5:4b` by default. The model has no
tools or shell access in this route. It selects candidate IDs and exact source
quotes; the server checks those quotes and retries once if they fail. The parent
agent interprets the evidence—quote checking cannot prove a behavioral claim.
The older `local_explorer_task` loop remains for historical comparisons.

The corresponding semantic, knowledge, verification, full-Explorer, and
framework CLI commands enforce the same gates. The full pipeline defaults to
deterministic `basic` retrieval; full hybrid mode additionally requires both
`ENABLE_SEMANTIC_SEARCH=1` and `ENABLE_GIT_HISTORY=1`.

## Autonomous workers

Git-writing workers are a separate safety category and are never enabled by
`ENABLE_EXPERIMENTAL`:

- `LOCAL_WORKER_ENABLED=1` registers `run_local_worker_task`.
- `CLOUD_CLAUDE_ENABLED=1` registers `run_cloud_claude_task`.

Both retain the shared Git-command allowlist and cloud validation hook. Verify
their work with `git status` and `git log`; do not trust a worker's own report.

## Frozen research

Historical benchmark results, model-routing experiments, fine-tuning plans,
framework research, and autonomous-agent experiments are preserved under
`docs/` and `scripts/`. They are not being expanded and are not part of the
normal runtime path. Start with the [documentation index](docs/README.md).

## Setup

Requires Node 22.13+ and an Ollama server for model-backed tools.

```bash
npm install
ollama serve
npm start
```

Copy `.env.example` to `.env` only when configuration overrides are needed.
Register `npm start` as a local stdio MCP server in your client.

## Verification

```bash
npm run test:features
npm run test:quality
npm run test:local-explore
npx tsc --noEmit
```

The Quality Review integration test
binds a temporary localhost port for a mocked Ollama endpoint.
