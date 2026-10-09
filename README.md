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
- `summarize_output` condenses large text through Ollama. Pass `text`, or `repository_root` + `path` to read a file (max 2 MB) inside the bridge.
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

`local_explore_repo` is the preferred model-backed scout. It retrieves basic
candidates, merges bounded source windows and caller context, and asks the
model to select up to sixteen evidence line references per question part. The
server shortlists lines for each evidence requirement, constrains output refs
to supplied lines, copies quotes from source, and retries once while retaining
checked partial citations. Image workflows and query/list questions have
explicit operation checklists and separate source windows. These checklists
preserve absent-file fallback branches and recognize provider-name phrasing.
Recognized named image operations require method declarations and conditions/errors
from the same indexed method. Cleanup-error contrasts keep upload and helper
evidence separate; the parent inspects the helper to establish suppression.
These checks
guide selection but do not prove semantic completeness across providers or
branches. Unchecked completeness, empty checklists and missing requirements
return `needs_review`. Recognized bounded coverage checks remain heuristics;
the parent still interprets behavior.

Local delegation, summaries and both scout routes default to
`qwen-context:h-q4_0-24k`. They inherit the selected model's saved `num_ctx`.
Default output reserves are the smaller of its finite saved ceiling and 8192
for delegation/summaries or 2048 for either scout. Optional request fields
override these limits explicitly; long output needs a larger `num_predict`.
H defaults to 24576 context / 16000 saved output. The
[desktop GPU report](docs/experimental/benchmarks/runs/2026-10-06-h-desktop-gpu.md)
records the 50K/32K offload and verified 24K placement. The retained
`qwen-context:h-q4_0-50k` is an explicit option for larger inputs; it can offload
under desktop memory pressure. At the default output reserves, 24K leaves 15360
input tokens for delegation/summaries and 21504 for scouts, before prompt/schema
charges. Oversized inputs still return `input_overflow`.
Restart the MCP server through your client to load the new default. In Codex for
VS Code, run **Developer: Reload Window** from the command palette to start a fresh
server process. Existing clients explicitly requesting 50K must select the new tag
or omit `model`. Budget metadata
identifies limits from the model, tool policy, or request. Advanced
discovery/verification also inherit saved settings. Missing saved limits use
reported 16384/8192 fallbacks; unbounded output defaults require an explicit
finite ceiling. `generate()` continues to return text.
Model settings are cached per tag for up to 60 seconds, including concurrent
requests. Restart the server after editing a tag to refresh them immediately.

H generation requests use the installed GGUF vocabulary and Qwen35 byte BPE
to count system text, source and the rendered assistant framing. The matching
weights and named renderer must be present locally; other configurations,
thinking requests and tokenizer failures keep the conservative UTF-8 byte
bound. The legacy chat scout also keeps byte accounting. Schema bytes remain
an additional reserve, and all routes retain the 1024-token safety margin.
Oversized requests return
`input_overflow`; source is never silently omitted and explicit output overrides
are preserved. Generation tools and the deterministic-first scout report byte
charges alongside the accounting method. Byte fallback can reject requests
whose actual token count would fit. In particular,
Explicitly reserving I's full 25000 ceiling at 32768 context leaves only
6744 input tokens. KV precision is a daemon
setting: I needs a q8 daemon; its tag alone cannot change the current q4 daemon.
See [the context checklist](docs/local-model-context-checklist.md).

`run_ollama_task` and `summarize_output` accept `timeout_ms` from 1000 through
900000; omission uses the configured server deadline (120 seconds by default).
Their `_meta.completion` reports stop reason, token counts and raw Ollama
timings in nanoseconds. A length stop or unfinished generation returns
`isError: true` with the partial text retained. Completion does not establish
answer correctness. These tools do not retry timed-out generation automatically.
Both also accept `format`: `"json"`, or a JSON Schema object to force an exact
output shape. The schema constrains shape, not factual accuracy.

`local_explore_repo` returns `no_evidence` before any model call when the
question names a tracked language the index cannot search (e.g. Ruby); the
index covers TypeScript, JavaScript, PHP, Python, Go and Rust (symbols, calls, includes,
inheritance; no PHP namespace/`use` resolution; Python imports resolve to files,
but `self.method()` calls and `import a.b` bindings stay unresolved). Go indexes
functions, receiver methods, named types and top-level const/var declarations.
Go calls, references and import paths are source-backed but unresolved: package
resolution, receiver dispatch and local binding identity are not inferred.
Go scout context adds only the nearest declaration or anonymous function header.
Rust indexes functions, lexical impl/trait methods, structs, enums, traits, type
aliases, modules, constants and statics. Method names preserve the literal impl
header (for example `impl Sender for Invoice.send`); this identifies source
context, not a trait or receiver binding. Calls, references, `use` declarations
and external module names stay unresolved. Crate paths, macros, `cfg` conditions
and dispatch are not evaluated. Rust scout context adds the nearest declaration
or closure header and, for direct members, the lexical impl/trait header.

The model has no tools or shell access in the scout route. The older
`local_explorer_task` loop remains for historical comparisons.

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
