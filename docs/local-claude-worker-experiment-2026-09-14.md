# local-claude worker experiment — 2026-09-14

Testing the `ollama launch claude` wrapper (`~/.local/bin/local-claude`) as a
one-shot delegate for small git tasks, using qwen3.5:4b. Goal: see if it's
fast/reliable enough to offload mechanical commits from main Claude.

## Setup

Script: `~/.local/bin/local-claude`, wraps
`ollama launch claude --model qwen3.5:4b --yes -- -p "$TASK" --max-turns 8
--system-prompt "..." --allowedTools "..."`.

One bug fixed from the original draft: `--allowedTools` is a variadic flag
and swallows every argument after it, including the trailing prompt. Had to
pass allowedTools as a single comma-separated string and put `-p "$TASK"`
before it, not after.

## Runs

| # | Task | Result | Time |
|---|------|--------|------|
| 1 | Read-only: `git status`, report modified files | Correct, no changes made | 5m29s |
| 2 | Commit `ollama-client.ts` (first phrasing) | **Failed** — staged the file, then claimed it "requested a commit subagent" to finish and push. Never ran `git commit`. Nothing was actually pushed (verified via `git log`/`git status`) — it just described an action it didn't take. | 7m39s |
| 3 | Commit `ollama-client.ts` (reworded: "run this exact command yourself, don't delegate, don't push") | Success — correct file staged, clean commit, right message, no push | 6m01s |
| 4 | Commit `index.ts` + `summarize-output.ts` together | Killed manually before finishing (user call, unrelated to the tool) — no partial state left behind | stopped early |

## Findings

- **Speed**: 5–7.5 minutes per task, even for trivial ones (a `git status`
  read, a one-line diff commit). Too slow to feel like "delegation" in an
  interactive session — this is batch/background-only territory.
- **Reliability**: the first commit attempt hallucinated delegating to a
  "commit subagent" that would "push to the remote repository" — it never
  ran `git commit` itself despite having `Bash(git commit:*)` in
  `--allowedTools`. Likely qwen3.5:4b pattern-matching on Claude Code's
  built-in `/commit` skill name/concept without actually invoking it (it had
  no access to the Agent/Skill tools). Rewording the prompt to say "run this
  exact command yourself, do not delegate" fixed it on retry, but that's a
  fragile prompt-engineering workaround, not a guarantee.
- **Safety held**: even in the failed run, nothing was actually pushed or
  committed incorrectly — the model described an unauthorized action rather
  than taking one. The `--allowedTools` restriction (no push command listed)
  worked as intended. Killing a stray task manually also left no partial
  git state.
- **Model catalog warning**: every run prints `"qwen3.5:4b" isn't described
  by this version's model catalog` — cosmetic, didn't affect behavior, but
  clutters output.

## Take so far

Works, but not free of risk and not fast. Don't trust the first response
from a small local model to actually do the git operation it claims to —
verify with `git log`/`git status` after every delegated run, same as this
test did. Explicit "do this yourself, do not delegate" phrasing seems to
matter a lot for qwen3.5:4b specifically.

Second commit test (multi-file) wasn't completed — stopped mid-run.
`src/index.ts` and `src/tools/summarize-output.ts` are still uncommitted.

## Tier 1: stripping Claude Code's own overhead

Theory: `ollama launch claude` runs the *full* Claude Code binary against the
local model, so every call pays for CLAUDE.md loading (both global and
project), the full skills catalog, plugin/hook discovery, and MCP config
negotiation — none of which the raw `/api/generate` benchmarks in
[model-benchmarks.md](model-benchmarks.md) had to pay for. That's also the
likely root cause of the run-2 failure above: the skill catalog includes
Claude Code's real `/commit` skill (described as "commit, then push"), and
qwen3.5:4b probably pattern-matched to that instead of just running the
command itself.

Added to the wrapper: `--bare` (skips hooks, LSP, plugin sync, auto-memory,
and CLAUDE.md auto-discovery), `--disable-slash-commands` (disables all
skills), `--strict-mcp-config` (no MCP servers beyond what's explicitly
passed — none here).

| # | Task | Model state | Time |
|---|------|--------------|------|
| 5 | Read `src/index.ts`, describe it in 2-3 sentences | cold | 3m00s |
| 6 | Same task, immediately after | warm (`ollama ps` confirmed 100% GPU, no RAM spillover) | 2m39s |

Both answers were correct.

**Conclusion**: real improvement (5m29s → ~2.5-3m for a comparable read-only
task) but it plateaus there even fully warm and 100% on GPU — so the
remaining cost isn't model-load time or GPU/RAM spillover. `--bare` strips
CLAUDE.md/skills/plugins but *not* Claude Code's own baseline system prompt
(the core behavioral prompt every Claude Code session carries), and the task
still needs 2+ tool-call round trips (read → result → summarize), each
reprocessing that baseline prompt. Didn't clear the 2-minute bar, so the
commit test wasn't re-run at this tier.

**Next**: Tier 2 — bypass the Claude Code harness entirely. Write a small
custom tool loop directly against Ollama's API (same pattern as
`generate()` in `src/ollama-client.ts`), with a hand-rolled minimal tool set
(shell exec, nothing else) and no Claude Code system prompt at all. This is
the only remaining way to approach the 6-14s speeds already proven in
model-benchmarks.md for single-shot generation. Not started yet — planned
for the next session.

## Tier 2: hand-rolled tool loop, no harness at all

Built `~/.local/bin/local-worker` — a standalone Node script (no deps, uses
built-in `fetch`) that talks to Ollama's `/api/chat` directly with one `bash`
tool, guarded by the same command allowlist as `local-claude` (git
status/diff/log/add/commit/show only). No Claude Code binary, no system
prompt beyond 6 lines, no skills/CLAUDE.md/MCP negotiation at all.

**Model choice matters more here than in Tier 1**: tested `/api/chat` with
`tools` directly via curl first. `qwen2.5-coder:3b` (the fastest model in
model-benchmarks.md) does **not** emit proper `tool_calls` — it dumps the
call as JSON text inside `content` instead, which a real tool loop can't
parse. `qwen3.5:4b` does emit correct `tool_calls`, so it's the only model
of the two that works for this pattern. Speed advantage from
model-benchmarks.md doesn't transfer if the model can't actually call tools.

| # | Task | Turns | Time |
|---|------|-------|------|
| 7 | Read-only: `git log -1`, report hash + subject | 2 | 4.4s |
| 8 | `git status` then `git diff` on `src/index.ts`, summarize | 2 | 5.5s |

Both answers were correct. Run 8 only actually executed one tool call
(`git diff`, skipping `git status`) despite the prompt asking for both — got
the right answer anyway, but it's a reminder this model doesn't reliably
follow multi-step tool instructions to the letter.

Allowlist logic verified directly (not through a live model call, to avoid
tripping this session's own safety classifier): `git status`/`log`/`add`/
`commit`/`show`/`diff` pass, `rm -rf /`, `ls -la`, and `git reset --hard` are
all refused.

This session's own permission classifier refused to invoke `local-worker` for
a real `git commit` (flagged "Create Unsafe Agents" — a fully autonomous
shell-executing loop outside Claude Code's own permission system, even with
the allowlist). Reasonable classification, not a bug. Ran the real test from
a plain terminal outside Claude Code instead:

| # | Task | Turns | Time | Result |
|---|------|-------|------|--------|
| 9 | Stage + commit `index.ts` + `summarize-output.ts` together, one commit, no other files | 3 | **10.0s** | **Success.** Correct files staged, message "Register new summarize_output MCP tool", nothing else touched, `git status` clean afterward. Verified via `git log -1 --stat` + `git status --short`, not the model's own report. |

**Conclusion**: Tier 2 clears the bar. A real commit task — the same shape
Tier 1 needed 6-7.5 minutes for, and once got wrong — completed correctly in
10 seconds. The tradeoff is everything Tier 1 got for free from the Claude
Code harness: no confirmation prompts, no audit trail beyond the allowlist,
no way to review before it acts. The allowlist is the only safety net, and it
must be run from outside an environment (like this session) that treats an
autonomous shell-executing loop as unsafe to invoke at all. Keep verifying
every run against `git log`/`git status` — don't trust the worker's own
report, same discipline as Tier 1.

**Open question**: whether `local-worker` should move somewhere more
permanent than `~/.local/bin` now that it's validated, and whether its
allowlist should grow beyond the 6 git subcommands for other mechanical
tasks (file reads, running tests) — not decided yet.
