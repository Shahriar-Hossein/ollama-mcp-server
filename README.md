# ollama-mcp-server

An MCP (Model Context Protocol) server that lets Claude Code delegate sub-tasks
to a local Ollama model instead of doing the work itself. The goal: keep heavy,
mechanical, or bulk work off your Claude usage quota (5h / weekly limits) by
routing it to a free local (or Ollama cloud) model, so Claude's own tokens are
spent only on the work that actually needs Claude-level reasoning.

## What it does today

- Single file: [src/index.ts](src/index.ts).
- Exposes one MCP tool, `run_ollama_task`, which:
  - Takes `prompt`, an optional `system_prompt`, and `model` (default
    `qwen2.5-coder:latest`).
  - POSTs to `http://localhost:11434/api/generate` (non-streaming) and returns
    the full response text to Claude.
- Runs via `npm start` → `tsx src/index.ts`, communicating over stdio (the
  standard way Claude Code talks to local MCP servers).

That's it — no build step, no config file, no model listing, no cloud routing
logic yet. It's a minimal working bridge, not a finished tool.

## Current state / things worth fixing

These are observations, not changes I've made (you asked for no code edits):

1. **Default model doesn't exist on this machine.** The code defaults to
   `qwen2.5-coder:latest`, but `ollama list` here only shows `qwen3.5:4b`. Any
   call that doesn't explicitly pass `model` will fail. Either pull
   `qwen2.5-coder`, or change the default to a model you actually have.
2. **No Ollama host config.** The endpoint is hardcoded to
   `http://localhost:11434`. There's no `OLLAMA_HOST` env var support, so this
   can't point at a remote box or a different port without editing code.
3. **"Cloud" is mentioned but not implemented.** The tool description says
   "local or cloud Ollama models," but the code only ever calls localhost.
   Ollama's cloud models (via `ollama signin` + cloud-tagged models like
   `*-cloud`) aren't wired up — there's no way to pick or fall back to them.
4. **No timeout.** The axios call has no timeout, so a stuck/huge generation
   can hang indefinitely with no way for Claude to recover.
5. **Uses `/api/generate`, not `/api/chat`.** That means no multi-turn context
   and no structured message roles — every call is a single stateless prompt.
   Fine for one-shot delegation, less fine for anything needing back-and-forth.
6. **No model discovery.** Claude has no way to ask "what models are
   available locally right now" — it just has to guess or be told. A
   `list_ollama_models` tool (wrapping `ollama list` / `/api/tags`) would let
   Claude pick a sensible model instead of relying on a hardcoded default.
7. **No `tsconfig.json`.** Works today because `tsx` doesn't strictly need
   one, but there's no `strict` mode, no target/module config pinned down —
   easy to drift.
8. **`package.json` has boilerplate defaults** — empty `author`, ISC license,
   a `test` script that just errors out, no `build`/`bin` entry for
   distributing this as an installable MCP server.

## What "best output" would need

For this to actually move the needle on your Claude quota, two things matter
more than the code:

**A. Claude needs to know *when* to delegate.** The server just exposes a
tool — nothing tells Claude to prefer it. That instruction lives in
[CLAUDE.md](CLAUDE.md) in this repo (and ideally in your global
`~/.claude/CLAUDE.md` if you want it to apply everywhere). Without that
guidance, Claude will keep doing heavy work inline and this MCP server will
sit unused.

**B. The model needs to fit the task.** A single hardcoded default
(`qwen2.5-coder`, and even that's missing here) means every delegated task —
whether it's "summarize this 2000-line log" or "write boilerplate CRUD code"
— goes to the same model. Worth having a couple of pulled models for
different jobs (a coder model, a general-purpose one) and letting Claude pass
`model` explicitly based on the task, once it knows what's available (see
point 6 above).

Concretely, the highest-leverage next steps, in order:
1. Fix the default model mismatch (pull `qwen2.5-coder` or change the default).
2. Add a `list_ollama_models` tool so Claude can check what's actually
   available before delegating.
3. Add `OLLAMA_HOST` env support so this isn't locked to localhost.
4. Add a timeout + streaming option so large tasks don't hang silently.
5. Write the delegation policy into CLAUDE.md (done — see that file) so
   Claude actually uses this instead of burning its own tokens.

## Setup

```bash
npm install
ollama serve          # if not already running
npm start              # starts the MCP server over stdio
```

Register it with Claude Code as a local MCP server (e.g. in your Claude Code
MCP config) pointing at `npm start` (or `tsx src/index.ts`) in this directory.
