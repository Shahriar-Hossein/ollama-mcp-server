# Delegation strategy: stretch Claude Code / Codex usage

Planning doc, not implemented yet. Goal: **Claude Code and Codex are both
$20/mo subs with usage limits (Claude's 5h/weekly windows, Codex's own cap).**
The point of this MCP server (and an equivalent bridge on the Codex side, if
one exists) is to push as much work as possible onto free models — local
Ollama + the two free-tier cloud models — so the paid limits last the whole
work session/week instead of running out early.

Ollama's cloud rate limit (1 request at a time) is a secondary constraint
that only matters once delegation volume goes up — see below.

## What we have

**Free — cloud** (rate limit: **only 1 request in flight at a time**):
- `nemotron-3-super:cloud`
- `gemma4:31b:cloud`

**Free — local** (no concurrency limit, bounded by this machine's speed/VRAM):
- `qwen3.5:4b` — best general local model
- `qwen2.5-coder:3b` / `qwen2.5-coder:1.5b` — coding-specific, two sizes
- `granite4.2:3b`
- `qwen3.5:0.8b` — smallest/fastest, trivial tasks only

**Paid — the thing we're protecting:**
- Claude Code ($20/mo, 5h + weekly limits)
- Codex ($20/mo, own usage cap)

## The actual goal

Every prompt/turn spent on Claude or Codex doing something a free model
could've done is quota wasted. The win condition isn't "use free models
occasionally" — it's **make delegation the default reflex** for anything
that doesn't need frontier-level reasoning, so Claude/Codex time is spent
only on work that actually benefits from it (architecture decisions,
judgment calls, anything touching the current diff/context).

This is already partly encoded in this repo's [CLAUDE.md](CLAUDE.md) (when
to delegate vs not). The gap is that it's a soft instruction Claude has to
remember to follow, not something enforced. Same policy should extend to
Codex if it has a comparable MCP/tool-calling mechanism.

## Routing policy (which free model, for what)

Default to local — it's unlimited and instant. Escalate to cloud only when
task quality needs it. Never do the task in Claude/Codex if a free model can
produce an acceptable draft/result.

| Task shape | Route to |
|---|---|
| Boilerplate, CRUD, mechanical transforms, test scaffolding | local: `qwen2.5-coder:3b` |
| Trivial rewrites, quick lookups, short summaries | local: `qwen3.5:0.8b` |
| General drafting, longer summarization, log condensing | local: `qwen3.5:4b` |
| Coding needing more care but not architecture-level | local: `qwen2.5-coder:3b`, escalate to cloud if output is weak |
| Complex reasoning/drafting where local output is unreliable | cloud: `nemotron-3-super:cloud` or `gemma4:31b:cloud` |
| Multi-step reasoning about *this* codebase's architecture, real-consequence decisions | keep in Claude/Codex — don't delegate |

Rule of thumb: **try local first, cloud second, Claude/Codex last.** Claude
and Codex quota is the most expensive resource here — spend it last, not
first.

## Making delegation actually happen (not just documented)

A written policy in CLAUDE.md only works if Claude reads and follows it
every session. To make it closer to automatic:

- Keep the "when to delegate / when not to" list in CLAUDE.md sharp and
  short so it's actually followed, not skimmed past.
- Add a `list_ollama_models` tool so Claude doesn't have to guess what's
  pulled before deciding to delegate — friction is a reason Claude falls
  back to doing things itself.
- Consider a `task_type` hint param on `run_ollama_task` that maps to the
  routing table above, so Claude doesn't need to pick a specific model tag —
  just says "this is mechanical" or "this is a draft" and the server picks.
- If a Codex-side equivalent bridge exists or gets built, mirror the same
  CLAUDE.md-style policy there (Codex's config/instructions file) so both
  paid tools default to delegating the same way.

## Respecting the cloud 1-request limit (once delegation volume is real)

Once Claude/Codex are actually delegating a lot, cloud calls could
overlap (e.g. Claude fanning out subagent calls that each hit
`run_ollama_task`). To avoid collisions:

- Track whether a cloud model tag (`*:cloud`) is currently in flight in the
  MCP server, via a simple in-process queue.
- A second cloud call while one is running queues behind it instead of
  firing concurrently.
- Local calls never wait on this queue — only cloud is serialized.
- On a cloud failure that looks like a rate/concurrency limit, retry once
  after a short delay, then fall back to the best local model rather than
  surfacing a hard error back to Claude/Codex (which would just burn their
  quota redoing the task).

## Open gaps (from README, relevant here)

- No model-discovery tool yet.
- No routing/model-selection logic in the server — caller has to already
  know which model fits.
- No cloud serialization — not urgent until delegation volume increases,
  but will cause silent failures once it does.
