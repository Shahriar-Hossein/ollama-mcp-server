# ollama-mcp-server

MCP server exposing tools (`run_ollama_task`, `list_ollama_models`,
`summarize_output`, `local_explorer_task`, and two opt-in autonomous tools)
that talk to a local Ollama instance. No build step — `npm start` runs it via
tsx over stdio. Keep it a thin bridge, not a general-purpose framework.

This is the canonical instructions file for this repo — other agent configs
(e.g. `CLAUDE.md`) import it rather than duplicating it, to avoid drift.

## Repository structure

- `src/index.ts` — wiring only: creates the server, registers tools. Keep it
  lean as more tools are added. `run_local_worker_task`/`run_cloud_claude_task`
  are only registered when `LOCAL_WORKER_ENABLED=1`/`CLOUD_CLAUDE_ENABLED=1`
  are set — don't remove that gate, they execute shell commands autonomously.
  `local_explorer_task` is registered unconditionally: it's read-only
  (Glob/Grep/Read only, no shell command ever runs), so it doesn't need the
  same opt-in gate.
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
  See [the evidence audit](docs/planning/project-reality-check-2026-09-19.md)
  and [docs/super-explorer/benchmarks.md](docs/super-explorer/benchmarks.md),
  "Embedder GPU contention fix + limit/timeout sweep" (2026-09-19).
- `src/shell-allowlist.ts` — the command allowlist and system prompts shared
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
- `src/tools/*.ts` — one file per MCP tool.
- `src/tools/local-explorer-task.ts` — read-only repo-discovery worker
  (glob/grep/read tool loop against a local Ollama model), promoted from the
  pilot in `docs/benchmarks/runs/2026-09-16-local-explorer.md`. Default model is
  `qwen3.5:4b` — it's the only local model confirmed to reliably emit real
  `tool_calls` in this loop; `qwen2.5-coder:7b` fabricates confidently
  instead of calling tools at all, don't route it here. Every `read`/`grep`
  path is checked against the repo root before touching disk (see
  `resolveWithinRoot`) since the path comes from model output, not the
  caller. Treat a `Confidence: low` final answer as "redo this yourself or
  escalate," never as a result to act on directly — that's the one signal
  the pilot showed actually tracked correctness.
- `docs/` — see [docs/README.md](docs/README.md) for the full index. Start
  there instead of opening files individually; it says what each doc answers
  so you only read the one you need.

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
  (`src/super-explorer/explore-cli.ts`) instead of the MCP tool.
- On the SE-01..SE-05 gold set, `granite4.2:3b` still fails to produce a
  verifier-supported answer through the Super Explorer pipeline (0/5,
  consistent across three separate trials) — it retrieves relevant evidence
  but underspecifies the claim. `nemotron-3-super:cloud` scores like
  `gemma4:31b-cloud` (2/5: passes host/timeout and shell-chaining questions,
  fails env-var-gating and registration-contrast questions). A Haiku
  `Explore` subagent run directly against the same fixture (no Super
  Explorer pipeline) still gets 5/5. See
  [docs/super-explorer/benchmarks.md](docs/super-explorer/benchmarks.md) for
  full detail.
- `local_explorer_task` never set Ollama's `num_ctx` option, so every call
  silently ran at Ollama's runtime default (4096 tokens) regardless of the
  model's real context window — a handful of tool-call results could evict
  earlier evidence from context before the model ever saw it. Fixed by
  adding an explicit `num_ctx` param (default 16384). In the 10-model
  SE-01..12 rerun after the fix, `granite4.2:3b` went from 0/5 (pre-fix,
  Super Explorer pipeline) to 7/12 (post-fix, same gold set) — though at
  ~11x `qwen3.5:4b`'s latency per question, so it's a fallback, not a
  routing default. `qwen3.5:4b` stayed the best (8/12). Do not route to
  `exaone-deep:2.4b` (rejects all calls with "does not support tools"),
  `deepseek-r1:1.5b`, or `nemotron-3-nano:4b` (both fail to engage the tool
  loop — `nemotron-3-nano:4b` fabricates file paths that don't exist in the
  repo rather than calling tools). See
  [docs/super-explorer/benchmarks.md](docs/super-explorer/benchmarks.md),
  "`num_ctx` fix: 10-model `local_explorer_task` sweep".

## Why this project exists

The user's Claude Code usage keeps hitting 5h/weekly limits, cutting into
their work week. The intent of this MCP server is to offload sub-tasks that
don't need Claude-level reasoning to a free local (or Ollama cloud) model, so
Claude's own quota is spent only on work that actually benefits from it.

## Development workflow

- No build/lint/typecheck pipeline exists yet — just `npm start` to run it.
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
- Keep the allowlists in `src/shell-allowlist.ts` and
  `scripts/validate-cloud-bash.cjs` synchronized manually — the standalone
  CJS validator can't import the TypeScript module.
- `parseAllowedGitCommand` must tokenize input and reject shell
  metacharacters; never replace it with a raw regex prefix check (a command
  like `git commit -m x && rm -rf /` must be rejected).
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

For repo-discovery sub-tasks specifically (find files, grep symbols, read
code, trace how something works — nothing needing judgment or synthesis),
try `local_explorer_task` first, on the routing idea validated in
`docs/benchmarks/runs/2026-09-16-local-explorer.md`:

- If it returns `Confidence: high` or `medium` with real file:line citations,
  use it as-is.
- If it returns `Confidence: low`, gave up without confirming an answer, or
  its citations don't check out, redo the search yourself (or delegate it to
  a `general-purpose`/`Explore` subagent) — don't pass a low-confidence
  answer through to harder reasoning downstream.
- That pilot only tested a small repo (~10 files) where a Haiku `Explore`
  subagent already beat it on accuracy, tool-call count, and wall time — the
  win case is a much larger repo where the exploration itself is expensive.
  Spot-check a handful of questions on any new, larger repo before trusting
  it there by default.

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
- There's no model-discovery tool yet, so don't assume a specific model is
  pulled — if unsure, ask the user or fall back to whatever `ollama list`
  shows, rather than assuming `qwen2.5-coder:latest`.
- Calls are stateless (`/api/generate`, no conversation memory) — pack
  whatever context the sub-task needs into a single `prompt`/`system_prompt`,
  don't expect follow-up turns to remember earlier ones.
- There's no timeout on the Ollama call — for large prompts, expect it can
  take a while; don't retry immediately on what looks like a hang.
