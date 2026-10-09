# ollama-mcp-server

MCP server exposing basic Ollama delegation plus deterministic repository
intelligence. Quality Review is a separate primary CLI. Advanced Explorer and
autonomous tools are opt-in. No build step — `npm start` runs it via tsx over
stdio. Keep it a thin bridge, not a general-purpose framework.

This is the canonical instructions file for this repo — other agent configs
(e.g. `CLAUDE.md`) import it rather than duplicating it, to avoid drift.

## Repository structure

- `src/index.ts` — wiring only: creates the server, registers tools. Keep it
  lean as more tools are added. Default registrations are the three basic
  Ollama tools plus deterministic outline/read/structural/basic-retrieval
  Explorer tools. Advanced tools use the centralized flags in
  `src/config/features.ts`. `run_local_worker_task`/`run_cloud_claude_task`
  remain independently gated by `LOCAL_WORKER_ENABLED=1` and
  `CLOUD_CLAUDE_ENABLED=1`; `ENABLE_EXPERIMENTAL` must never enable them.
- `src/config/features.ts` — validates feature flags and enforces feature
  dependencies. Experimental groups default off. The full Explorer requires
  the verification pipeline. A group-specific flag overrides the experimental
  master flag.
- `src/explorer/` — the supported deterministic repository index, outlines,
  symbol reads, structural queries, basic retrieval, and their CLIs.
- `src/experimental/` — advanced Explorer pipelines, adapters, benchmarks,
  optional MCP tools, and autonomous workers. Default startup does not import
  this tree. Keep new work out unless an experimental feature is explicitly
  resumed.
- Local delegation, summaries and both scout routes default to
  `qwen-context:h-q4_0-24k`. Read selected model settings via `/api/show`;
  inherit saved context limits; output defaults use the smaller of the saved
  finite ceiling and 8192 for delegation/summaries or 2048 for scouts. Explicit
  request limits override these reserves. Report input overflow instead of
  dropping evidence or reducing explicit output limits.
  H defaults to 24576 context / 16000 saved output for desktop GPU fit. The
  retained `qwen-context:h-q4_0-50k` is an explicit large-context option and can
  offload under desktop memory pressure. Verify placement rather than forcing
  GPU layers; smaller output limits alone do not change allocated context.
  KV cache precision remains a daemon setting; an I tag does not enable q8.
- H generation input uses `src/qwen-tokenizer.ts` against its pinned local
  GGUF vocabulary and Qwen35 renderer framing. Unsupported settings, thinking,
  unavailable vocabulary and bounded tokenizer failures keep byte accounting.
  Schema bytes and the 1024 margin remain reserved. Legacy chat uses bytes.
  Basic delegation/summary tools expose completion metrics and an optional
  1000–900000 ms deadline that covers model/budget setup too; generation
  streams, so length stops and timeouts return partial text with `isError`
  (`done_reason: "timeout"`; no text yet gives the timeout error).
  Both accept an optional `format` (`"json"` or a JSON Schema) for exact shape.
- `src/request-queue.ts` — serializes local-model generation across MCP processes (lock dir in tmp, stale-pid steal); cloud tags skip it. Queue wait counts against `timeout_ms`.
- `src/ollama-client.ts` — shared Ollama HTTP calls (`generate`, `listModels`,
  `embed`) and host/timeout config. `embed()` sends `keep_alive: "0"` so the
  embedding model unloads right after each call — without it, Ollama kept the
  embedding model resident (its default 5min keep_alive) while the much
  larger generation model loaded next, and the two competed for GPU memory.
  This was the actual cause of `qwen3.5:4b` Super Explorer timeouts diagnosed
  as "CPU spillover," not the model's own resource needs. The subsequent
  reported 12/12 for both Qwen sizes is withdrawn by the 2026-09-19 audit:
  the saved limit-80 retry answers all abstain with no cited claims. The
  reported counts measured non-error responses, not correct answers, and
  combined limit-40 results with limit-80 retries. Do not use them for routing.
  See [the evidence audit](docs/experimental/planning/project-reality-check-2026-09-19.md)
  and [docs/experimental/super-explorer/benchmarks.md](docs/experimental/super-explorer/benchmarks.md),
  "Embedder GPU contention fix + limit/timeout sweep" (2026-09-19).
- `src/experimental/workers/shell-allowlist.ts` — the command allowlist and system prompts shared
  by both autonomous tools. Both must stay in sync with this file, not drift
  into separate allowlists. `parseAllowedGitCommand` tokenizes and rejects
  shell metacharacters rather than regex-prefix-matching the raw string — a
  plain `/^git commit(\s|$)/` test still matches `"git commit -m x && rm -rf
  /"`, which is a real injection hole, not a theoretical one. Callers must
  exec the returned argv directly (no shell), never re-pass the original
  command string to something shell-interpreted.
- `scripts/validate-cloud-bash.cjs` — PreToolUse hook for
  `run_cloud_claude_task`'s harness subprocess, wired in via `--settings`.
  `--allowedTools` alone is documented by Claude Code as not a security
  boundary (it splits `&&`/`;`/`|` but not `bash -c '...'` wrapping or `git -c
  core.editor=...` flag injection) — this hook re-validates independently.
  Keep its allowlist in sync with `shell-allowlist.ts` by hand; it's a
  standalone `.cjs` file (no build step) so it can't import the TS module.
- `src/quality-review/` — separate CLI (`npm run quality -- ...`), with no MCP
  registration. Target sources are read-only; all output stays under the
  target's `.quality-review/`. Uses existing JS/TS tree-sitter parsers, built-in
  SQLite, and the shared Ollama client. Run `npm run test:quality` for fixture
  tests. See [docs/quality-review.md](docs/quality-review.md).
- `src/tools/*.ts` — one file per MCP tool.
- `src/experimental/tools/local-explore-repo.ts` — opt-in deterministic-first
  scout. It separates question parts and lets H select cited lines.
  `local-explore-packing.ts` follows static calls and local imports in both
  directions for at most two hops, capped at six files per part. Packing
  preserves each retrieved chain file, merges shared lines, and refuses
  overflow before generation. Import adjacency does not prove runtime calls.
  One bounded source expansion is allowed within the same character cap.
  Candidate IDs and line numbers are checked, and quotes are copied from source;
  named call/configuration and token-operation checklists guide selection.
  `local-explore-relationships.ts` checks explicit named caller identity and
  direct top-level object initializer/use bindings. Static aliases are supported;
  unresolved member implementations, shadowed imports and complex providers
  require review. These checks do not establish general semantic completeness.
  `local-explore-operations.ts` supplies explicit image-workflow and query/list
  operation checklists. Packing preserves separate operation windows within
  large sources. Operation plans also search indexed root-relative `src/`
  import paths and matching unresolved method names for provider context;
  these hints do not resolve aliases, injected providers or runtime calls.
  Image checklists include missing-input, optional-file, record-lookup and
  upload-result guards. Negated replacement requests preserve optional-upload
  state and empty fallback windows. Provider-name phrasing uses operation hints,
  not a literal provider function requirement. Recognized named image operations
  pair declarations with conditions/errors in one indexed method; nested indexed
  callables and competing methods cannot complete that method's checklist.
  Cleanup-error contrasts separate upload errors from the cleanup helper's catch;
  suppression still requires parent inspection. Natural operation plans and unrecognized questions require
  review because semantic completeness remains unchecked; empty checklists
  must never establish support. Selection allows sixteen refs per part while
  retaining the six-part, character, output and two-call budgets.
  Flag questions also pack statically resolved mapping helpers and use mapped
  property names to anchor consumer windows. Named keys take priority over
  unrelated flags. These windows provide context, not proof of provenance;
  model selection can still omit resolver branches.
  Flag-resolution questions shortlist the mapped helper's declaration, local
  inputs and direct return/throw outcomes with enclosing if/else guards.
  Aliases are supported; shadowed or missing helpers remain unresolved, and
  nested callables cannot supply outcomes. Flag semantics still require parent
  review; these source relationships do not prove runtime configuration.
  Resolver recognition covers literal `ENABLE_*`/`*_ENABLED` arguments to
  direct JS/TS helper calls; injected providers and arbitrary configuration
  APIs remain outside that check.
  Named configuration keys also anchor JS/TS `get`/`getOrThrow` reads,
  multiline defaults and direct reader outcomes with if/else guards. Packing
  preserves separated getter, constructor and outcome windows in import
  neighbors. Getter names and adjacency are context hints, not provider or
  data-flow resolution; configuration semantics always require parent review.
  Initialization questions pack imported Nest ConfigModule `forRoot`/`forRootAsync`
  call context, including aliases and options. Provider questions pair named
  reads with direct factory `provide`/`inject`/parameter declarations or constructor
  parameter context. Spreads, duplicate fields, dynamic inject arrays, missing
  bindings and recognized shadowing stay unresolved. These are source-context
  checks, not dependency-container or environment-load resolution. Module scope,
  provider overrides and runtime provenance still require parent review.
  Imported configuration constants pair direct named imports/aliases with an
  exported top-level const initializer, actual value use and named reader.
  Direct object properties reject spreads and duplicate keys. Imported constant
  default exports, reexports and deeper chains remain unresolved. Direct module
  arrays and provider/injection tokens in an unambiguous imported Nest Module
  decorator do not create configuration-value requirements. Ordinary objects,
  indirect or ambiguous metadata and provider values retain value obligations.
  Direct default-import instance calls pair a local default-exported construction
  (or top-level const instance), constructor arguments/body and named reader
  declaration/use. Literal named reads exclude comments and nested examples.
  Environment object references, scalar reads and copies retain their source
  arguments; these checks do not infer capture or runtime identity. Shadowing,
  reassignment, factory exports, reexports and spread arguments stay unresolved.
  Destructured binding targets, direct constructor reassignment and called-member
  writes invalidate instance context; static/accessor readers remain unresolved.
  Dynamic/prototype mutations remain outside this bounded check.
  Instance semantics always require parent review. Nest and dotenv loader context
  helps initialization-order review; source order never proves preload timing.
  Direct registration does not require a tool-registration guard.
  `supporting_context` adds labeled extras for selected JS/TS lines: Nest `@Module` class/key/entries,
  the enclosing declaration header, up to three scalar sibling properties and the first use of each
  name from a selected import (max 12 total; text match, not binding resolution). It never
  changes evidence, coverage or status; selected evidence is deduped by file:line.
  Short literal citations must match the complete checked source line.
  Unresolved requirements must return `needs_review` even when nearby citations
  pass generic coverage checks. These checks are heuristic; the parent still
  interprets behavior. The legacy
  tool below remains for benchmarks.
- `src/experimental/tools/local-explorer-task.ts` — read-only repo-discovery worker
  (glob/grep/ast-grep/read tool loop against a local Ollama model), promoted from the
  pilot in `docs/experimental/benchmarks/runs/2026-09-16-local-explorer.md`. Default model is
  H, using the `qwen3.5:4b` weights/template — that family reliably emits real
  `tool_calls` in this loop; `qwen2.5-coder:7b` fabricates confidently
  instead of calling tools at all, don't route it here. Every `read`/`grep`
  path is checked against the repo root before touching disk (see
  `resolveWithinRoot`) since the path comes from model output, not the
  caller. `ast_grep` invokes only the fixed executable with validated argv
  (never a shell), and accepts TypeScript/JavaScript only. Treat a `Confidence: low` final answer as "redo this yourself or
  escalate," never as a result to act on directly — that's the one signal
  the pilot showed actually tracked correctness. It is experimental and
  registered only with `ENABLE_LOCAL_EXPLORER_TASK=1` (or the master flag).
- `docs/` — start with [docs/project-map.md](docs/project-map.md) when you
  need repository orientation. Then use [docs/README.md](docs/README.md) for
  the full index; it says what each doc answers so you only read the one you
  need.

See [README.md](README.md) for the project pitch and setup.

## Known traps (from 2026-09-17/18 super-explorer benchmark session)

- `explore_repository`/`explore-cli.ts` calls git via `execFileSync`/
  `spawnSync` with `cwd: repository_root`. If that directory doesn't exist
  (e.g. a `git worktree` entry marked `prunable` whose folder was already
  deleted), Node reports `spawnSync git ENOENT` — identical to git missing
  from `PATH`. Don't chase a PATH/sandbox fix on that error; first check
  `ls <repository_root>` and `git worktree list` for a stale/prunable entry.
- `explore_repository` has no `timeout` param and returns no per-call latency
  in its response — it inherits `REQUEST_TIMEOUT_MS` from
  `src/ollama-client.ts` (120s default) for every model. If a benchmark needs
  latency numbers or a different deadline per model, use the CLI runner
  (`src/experimental/explorer/explore-cli.ts`) instead of the MCP tool.
- On the SE-01..SE-05 gold set, `granite4.2:3b` still fails to produce a
  verifier-supported answer through the Super Explorer pipeline (0/5,
  consistent across three separate trials) — it retrieves relevant evidence
  but underspecifies the claim. `nemotron-3-super:cloud` scores like
  `gemma4:31b-cloud` (2/5: passes host/timeout and shell-chaining questions,
  fails env-var-gating and registration-contrast questions). A Haiku
  `Explore` subagent run directly against the same fixture (no Super
  Explorer pipeline) still gets 5/5. See
  [docs/experimental/super-explorer/benchmarks.md](docs/experimental/super-explorer/benchmarks.md) for
  full detail.
- `local_explorer_task` never set Ollama's `num_ctx` option, so every call
  silently ran at Ollama's runtime default (4096 tokens) regardless of the
  model's real context window — a handful of tool-call results could evict
  earlier evidence from context before the model ever saw it. Fixed by
  adding an explicit `num_ctx` param (now inherited from the selected model's
  saved settings; it was 16384 in the 10-model benchmark). In the 10-model
  SE-01..12 rerun after the fix, `granite4.2:3b` went from 0/5 (pre-fix,
  Super Explorer pipeline) to 7/12 (post-fix, same gold set) — though at
  ~11x `qwen3.5:4b`'s latency per question, so it's a fallback, not a
  routing default. `qwen3.5:4b` stayed the best (8/12). Do not route to
  `exaone-deep:2.4b` (rejects all calls with "does not support tools"),
  `deepseek-r1:1.5b`, or `nemotron-3-nano:4b` (both fail to engage the tool
  loop — `nemotron-3-nano:4b` fabricates file paths that don't exist in the
  repo rather than calling tools). See
  [docs/experimental/super-explorer/benchmarks.md](docs/experimental/super-explorer/benchmarks.md),
  "`num_ctx` fix: 10-model `local_explorer_task` sweep".

## Why this project exists

The user's Claude Code usage keeps hitting 5h/weekly limits, cutting into
their work week. The intent of this MCP server is to offload sub-tasks that
don't need Claude-level reasoning to a free local (or Ollama cloud) model, so
Claude's own quota is spent only on work that actually benefits from it.

## Development workflow

- No build/lint pipeline is required. `npm start` runs the MCP server;
  `npm run test:features` checks feature configuration, `npm run test:quality`
  tests Quality Review, `npm run lint` runs Biome (lint only, no formatter),
  and `npm run typecheck` checks TypeScript (`npm run check` runs both).
- For a benchmark that can outlive this command interface's ~30-second attachment window, launch one detached `setsid nohup flock -n` supervisor with stdout/stderr redirected to an ignored `benchmark-data/` log. Poll that log and its final artifact; do not retry while its lock is held. Before starting the next model, confirm the prior artifact is complete and the lock-owning process is gone.
- Keep changes minimal; this is meant to stay a thin bridge, not grow into a
  framework.
- If you change the default model, check `ollama list` first — don't assume
  `qwen2.5-coder:latest` is pulled (it wasn't, as of last check; only
  `qwen3.5:4b` was present).
- When changing behavior, update the relevant doc (this file, `docs/`) if it
  makes an existing claim stale — that's the drift this file exists to avoid.

## Security invariants

- `run_local_worker_task` and `run_cloud_claude_task` must remain opt-in,
  enabled only by `LOCAL_WORKER_ENABLED=1` and `CLOUD_CLAUDE_ENABLED=1`. They
  execute shell commands autonomously.
- Quality Review and default Explorer operations must remain read-only toward
  target sources. Experimental MCP tools must not register when disabled.
- Keep the allowlists in `src/experimental/workers/shell-allowlist.ts` and
  `scripts/validate-cloud-bash.cjs` synchronized manually — the standalone
  CJS validator can't import the TypeScript module.
- `parseAllowedGitCommand` must tokenize input and reject shell
  metacharacters; never replace it with a raw regex prefix check (a command
  like `git commit -m x && rm -rf /` must be rejected).
- Both validators also enforce a per-subcommand flag allowlist (no `--output`,
  `--amend`, `--no-verify`, `-F`, absolute or `..` paths) and the hook fails
  closed on malformed input. `npm run test:workers` checks both stay in step.
- Callers must exec the validated argv directly, no shell — never re-pass the
  original command string to a shell-interpreted API.
- Treat `--allowedTools` as a convenience restriction, not a security
  boundary — the validation hook must independently check commands,
  including wrapped `bash -c` commands and flag injection such as
  `git -c core.editor=...`.

## Delegating to this MCP server, while working on other projects

If `ollama-mcp-server` is registered as an active MCP tool in a session,
prefer delegating to `run_ollama_task` instead of doing the work yourself when
a sub-task is:

- **Bulk/mechanical**: generating boilerplate, repetitive code, straightforward
  CRUD, test scaffolding, simple config/data transforms.
- **Large-context summarization**: condensing long logs, large file dumps, or
  verbose command output into a short summary you then use.
- **Draft-then-review work**: a first-pass draft (of text, code, or a plan)
  that you'll review and refine afterward — let Ollama produce the draft.

For repo-discovery sub-tasks specifically, prefer deterministic
`hybrid_retrieve` (`basic` mode), `outline_file`, `read_symbol`, and structural
queries. If the experimental `local_explore_repo` is available, use it for
bounded Qwen-assisted scouting. Evidence line references are checked and
quotes are copied from source, but selection may still omit the answer; inspect
the cited source before making a behavioral claim. If it returns `needs_review`,
lacks needed evidence, or selects irrelevant files, use Luna for bounded read-only
exploration in Codex when available, then verify its cited source. The
2026-09-25 smoke check put the required source in context for 4/4 questions,
but Qwen selected fully useful evidence for only 2/4; see
`docs/experimental/benchmarks/runs/2026-09-25-local-explore-repo-improvements.md`.

The older `local_explorer_task` remains for historical tool-loop comparisons.
Its 2026-09-16 pilot found low confidence useful as a fallback signal, but did
not establish reliable savings on unfamiliar repositories.

If `run_local_worker_task` or `run_cloud_claude_task` are available (they're
opt-in — check the tool list, don't assume), they can take a mechanical git
task (stage + commit, read a diff) all the way to completion instead of you
running the commands yourself — but only for tasks that fit their allowlist
(git status/diff/log/add/commit/show), never for anything destructive or
needing judgment. `run_local_worker_task` is the fast path for plain git
tasks; `run_cloud_claude_task` is for anything that benefits from the real
Claude Code harness (Read/Glob/Grep, skills) since it runs against an Ollama
cloud model with enough context for that. Always verify what they actually
did via `git log`/`git status` afterward — don't trust either tool's own
report, they've been wrong before.

Do **not** delegate when the task needs:

- Multi-step reasoning about *this specific* codebase's architecture or
  conventions.
- Decisions with real consequences (destructive commands, security-relevant
  code, anything the user would want to review).
- Tight integration with tools you're already holding context for (mid-edit
  refactors, anything needing the current diff/state).

Practical notes given the current implementation:
- Use `list_ollama_models` or `ollama list` to check available tags; do not
  assume a specific model is pulled.
- Calls are stateless (`/api/generate`, no conversation memory) — pack
  whatever context the sub-task needs into a single `prompt`/`system_prompt`,
  don't expect follow-up turns to remember earlier ones.
- Shared calls have a configured deadline (120 seconds by default). Basic
  delegation/summaries accept an explicit `timeout_ms` up to 900000. Do not
  retry a timed-out job before confirming its prior work stopped.
