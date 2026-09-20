# ollama-mcp-server

An MCP (Model Context Protocol) server that lets Claude Code delegate sub-tasks
to a local Ollama model instead of doing the work itself. The goal: keep heavy,
mechanical, or bulk work off your Claude usage quota (5h / weekly limits) by
routing it to a free local (or Ollama cloud) model, so Claude's own tokens are
spent only on the work that actually needs Claude-level reasoning.

## What it does today

Runs via `npm start` → `tsx src/index.ts`, communicating over stdio (the
standard way Claude Code and other clients talk to local MCP servers). No
build step, no config file.

**Always on:**
- `run_ollama_task` — one-shot prompt/system_prompt to a local (or, later,
  cloud) Ollama model via `/api/generate`.
- `summarize_output` — condenses large text through a local model so it never
  enters the caller's own context.
- `list_ollama_models` — lists what's pulled/signed in, so a caller can pick
  a model instead of guessing.
- `local_explorer_task` — read-only repo-discovery worker (glob/grep/read
  tool loop against a local model). No shell execution, so it's always on
  unlike the two tools below.

**Opt-in (autonomous shell execution — off by default):**
- `run_local_worker_task` (set `LOCAL_WORKER_ENABLED=1`) — a hand-rolled tool
  loop against Ollama's `/api/chat` with one `bash` tool, restricted to
  `git status/diff/log/add/commit/show`. No harness, no confirmation prompts.
  ~10s for a real commit in testing.
- `run_cloud_claude_task` (set `CLOUD_CLAUDE_ENABLED=1`) — runs the full
  `ollama launch claude` binary (real Claude Code harness, no stripped-down
  flags) against a free **Ollama cloud** model, same allowlist plus
  Read/Glob/Grep. Local models were tried here first and ruled out — the
  harness needs a large context window (Ollama recommends >=64k) to carry
  CLAUDE.md/skills/system-prompt overhead, and this machine's GPU can't give
  a local model that much context. Cloud models can.

Both opt-in tools accept an optional `cwd` so one running server instance can
be pointed at whatever repo you're working in, rather than being pinned to
wherever it was launched from.

See [docs/planning/local-claude-worker-experiment.md](docs/planning/local-claude-worker-experiment.md)
for how these two were benchmarked and why local-worker is the recommended
default. **Always verify what either one did via `git log`/`git status`** —
neither should be trusted on its own report.

## CLI quality reviewer

A separate, read-only CLI reviews one function per Ollama request and saves
progress in the target repository's `.quality-review/` directory. No build is
needed; use Node 22.13+.

```bash
npm run quality -- scan --cwd /path/to/repo
npm run quality -- review --count 10 --cwd /path/to/repo
npm run quality -- findings --cwd /path/to/repo
```

Review suggestions manually; accept/reject only records a decision. Supports
JavaScript/TypeScript today. MCP integration comes later. See the
[quality reviewer guide](docs/quality-review.md) for commands, model configuration,
queue behavior and safety limits.

## Benchmarks

Model and config measurements live in
[docs/benchmarks/MASTER.md](docs/benchmarks/MASTER.md) — one master record, not a directory
per run. [docs/benchmarks/README.md](docs/benchmarks/README.md) has the rule
for adding to it: numbers go in git, generated artifacts go in the gitignored
`benchmark-data/`.

## Known gaps

- **Uses `/api/generate`, not `/api/chat`, for `run_ollama_task`.** No
  multi-turn context or structured message roles — every call is a single
  stateless prompt (cloud models work here too, same endpoint, once signed in
  via `ollama signin` — it's not localhost-only). Fine for one-shot
  delegation, not for back-and-forth.
- **`package.json` still has boilerplate defaults** — empty `author`, ISC
  license, a `test` script that just errors out, no `build`/`bin` entry for
  distributing this as an installable MCP server.

Already fixed, despite older notes elsewhere claiming otherwise: default
model, `OLLAMA_HOST` config, request timeout (`OLLAMA_TIMEOUT_MS`, shared
across all tools via `src/ollama-client.ts`), `list_ollama_models` discovery,
and `tsconfig.json` all exist now — see [AGENTS.md](AGENTS.md) for current
repository structure.

## Delegation policy

The instructions that tell Claude Code *when* to prefer this server over
doing work inline live in [AGENTS.md](AGENTS.md) (imported by `CLAUDE.md`),
and ideally also in your global `~/.claude/CLAUDE.md` if you want it to apply
across projects. Without that guidance in context, Claude will keep doing
heavy work itself and this server will sit unused.

## Setup

```bash
npm install
ollama serve          # if not already running
npm start              # starts the MCP server over stdio
```

Register it with Claude Code as a local MCP server (e.g. in your Claude Code
MCP config) pointing at `npm start` (or `tsx src/index.ts`) in this directory.
