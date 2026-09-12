# ollama-mcp-server

MCP server exposing tools (`run_ollama_task`, `list_ollama_models`) that talk
to a local Ollama instance. No build step — `npm start` runs it via tsx over
stdio.

- `src/index.ts` — wiring only: creates the server, registers tools. Keep it
  lean as more tools are added.
- `src/ollama-client.ts` — shared Ollama HTTP calls (`generate`, `listModels`)
  and host/timeout config.
- `src/tools/*.ts` — one file per MCP tool.
- `docs/cloud-strategy.md` — plan for Ollama cloud model routing.

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
