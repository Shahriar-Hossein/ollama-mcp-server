# ollama-mcp-server

## Project overview

This repository is a thin MCP server that exposes tools for a local Ollama
instance: `run_ollama_task`, `list_ollama_models`, `summarize_output`, and two
opt-in autonomous tools. There is no build step; `npm start` runs the server
through `tsx` over stdio.

Keep the project small and focused. It is a bridge, not a general-purpose
framework.

## Repository structure

- `src/index.ts` — server and tool registration only. Keep it lean.
- `src/ollama-client.ts` — shared Ollama HTTP calls (`generate`, `listModels`),
  including host and timeout configuration.
- `src/shell-allowlist.ts` — shared command allowlist and system prompts for
  both autonomous tools.
- `src/tools/*.ts` — one file per MCP tool.
- `scripts/validate-cloud-bash.cjs` — independent PreToolUse validation for
  the cloud Claude harness subprocess.
- `docs/BENCHMARKS.md` — master benchmark record and current routing
  recommendation. New results go in as table rows; generated artifacts go in
  the gitignored `benchmark-data/`. See `docs/README.md` for the rule.
- `docs/cloud-strategy.md` — cloud model routing plan.
- `docs/local-claude-worker-experiment-2026-09-14.md` — benchmark evidence and
  rationale for the current local/cloud split.

## Development workflow

- No build, lint, or typecheck pipeline exists yet. Use `npm start` for the
  available runtime check.
- Make the smallest change that solves the request.
- If changing the default model, first check `ollama list`; do not assume
  `qwen2.5-coder:latest` is installed. The last known installed model was
  `qwen3.5:4b`.
- When changing behavior, update relevant documentation if the project
  rationale or operational assumptions become inaccurate.

## Security invariants

- `run_local_worker_task` and `run_cloud_claude_task` must remain opt-in,
  enabled only by `LOCAL_WORKER_ENABLED=1` and `CLOUD_CLAUDE_ENABLED=1`.
  They execute shell commands autonomously.
- Keep the allowlists in `src/shell-allowlist.ts` and
  `scripts/validate-cloud-bash.cjs` synchronized manually. The standalone CJS
  validator cannot import the TypeScript module.
- `parseAllowedGitCommand` must tokenize input and reject shell metacharacters;
  never replace it with a raw regex prefix check. A command such as
  `git commit -m x && rm -rf /` must be rejected.
- Callers must execute the validated argv directly without a shell. Never
  re-pass the original command string to a shell-interpreted API.
- Treat `--allowedTools` as a convenience restriction, not a security
  boundary. The validation hook must independently check commands, including
  wrapped `bash -c` commands and flag injection such as
  `git -c core.editor=...`.

## Using this MCP server on other projects

When this server is available as an MCP tool, delegate only bounded work that
is easy to review afterward:

- repetitive or mechanical implementation, boilerplate, CRUD, scaffolding,
  and simple data/config transforms;
- summarizing long logs, file dumps, or command output;
- first-pass drafts that will be reviewed and refined.

The opt-in worker tools may complete narrowly scoped, allowlisted git tasks
such as status, diff, log, add, commit, or show. Use the local worker for
plain mechanical git work and the cloud worker when the real Claude harness
and larger context are useful. Always verify the actual result with `git log`,
`git status`, or an equivalent read-only check; do not rely on the worker's
report alone.

Do not delegate work that requires architecture decisions for this codebase,
security judgment, destructive commands, consequential decisions, or tight
integration with edits and state already in the current session.

Remember that Ollama calls are stateless (`/api/generate`). Include all
necessary context in one prompt and do not expect follow-up calls to remember
earlier context. There is no Ollama-call timeout, so large prompts may take a
while; do not immediately retry a call that appears to hang. Since there is no
model-discovery tool, use `ollama list` when the available model is uncertain.
