# ollama-mcp-server

MCP server exposing tools (`run_ollama_task`, `list_ollama_models`,
`summarize_output`, `local_explorer_task`, and two opt-in autonomous tools)
that talk to a local Ollama instance. No build step — `npm start` runs it via
tsx over stdio.

- `src/index.ts` — wiring only: creates the server, registers tools. Keep it
  lean as more tools are added. `run_local_worker_task`/`run_cloud_claude_task`
  are only registered when `LOCAL_WORKER_ENABLED=1`/`CLOUD_CLAUDE_ENABLED=1`
  are set — don't remove that gate, they execute shell commands autonomously.
  `local_explorer_task` is registered unconditionally: it's read-only
  (Glob/Grep/Read only, no shell command ever runs), so it doesn't need the
  same opt-in gate.
- `src/ollama-client.ts` — shared Ollama HTTP calls (`generate`, `listModels`)
  and host/timeout config.
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
  pilot in `docs/benchmarks/local-explorer-2026-09-16.md`. Default model is
  `qwen3.5:4b` — it's the only local model confirmed to reliably emit real
  `tool_calls` in this loop; `qwen2.5-coder:7b` fabricates confidently
  instead of calling tools at all, don't route it here. Every `read`/`grep`
  path is checked against the repo root before touching disk (see
  `resolveWithinRoot`) since the path comes from model output, not the
  caller. Treat a `Confidence: low` final answer as "redo this yourself or
  escalate," never as a result to act on directly — that's the one signal
  the pilot showed actually tracked correctness.
- `docs/BENCHMARKS.md` — master benchmark record: every measured number, the
  current model/config routing recommendation, and the traps. **Any new
  benchmark result goes in there as a table row, not in a new directory.**
  Generated artifacts (raw responses, jsonl logs, VRAM samples, grader
  scripts) go in the gitignored `benchmark-data/` — see `docs/README.md` for
  the split rule before running a benchmark.
- `docs/cloud-strategy.md` — plan for Ollama cloud model routing.
- `docs/local-claude-worker-experiment-2026-09-14.md` — benchmark data behind
  `run_local_worker_task` and why the full-harness `ollama launch claude`
  approach moved to cloud models only: it needs a large context window
  (Ollama recommends >=64k) to carry CLAUDE.md/skills/system-prompt overhead,
  and local models on this GPU can't provide that much context. Local-model
  full-harness runs were also 5-7.5min and once hallucinated a commit it
  never ran; `run_local_worker_task`'s hand-rolled loop stays the fast path
  (~10s) for mechanical git tasks, and `run_cloud_claude_task` is for
  anything that benefits from the real harness (Read/Glob/Grep, skills) at
  cloud-model context sizes.

See [README.md](README.md) for the full picture, known gaps, and what's
missing to make delegation reliable (model mismatch, no cloud routing, no
model discovery).

## Why this project exists

The user's Claude Code usage keeps hitting 5h/weekly limits, cutting into
their work week. The intent of this MCP server is to offload sub-tasks that
don't need Claude-level reasoning to a free local (or Ollama cloud) model, so
Claude's own quota is spent only on work that actually benefits from it.

## When working *on* this project

- No build/lint/typecheck pipeline exists yet — just `npm start` to run it.
- Keep changes minimal; this is meant to stay a thin bridge, not grow into a
  framework.
- If you change the default model, check `ollama list` first — don't assume
  `qwen2.5-coder:latest` is pulled (it wasn't, as of last check; only
  `qwen3.5:4b` was present).

## When using this MCP server *while working on other projects*

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
`docs/benchmarks/local-explorer-2026-09-16.md`:

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
