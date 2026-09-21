# Agentic delegation benchmark — 2026-09-14

Can a free model *drive a git task to completion*, as opposed to producing
correct text? Different question from [MASTER.md](../MASTER.md),
which measures single-completion output quality.

Same open-ended task given to three delegation paths, to see which are
viable for offloading mechanical git work from Claude's own quota. Task:
"look at the uncommitted changes and commit them in sensible logical
groups" — no file list given, so grouping judgment was part of the test.

## Results

| Path | Model | Outcome | Notes |
|---|---|---|---|
| `run_local_worker_task` | `qwen3.5:4b` | **Failed** | Gave up after 10 turns. No commit, no staged files, git state unchanged. |
| `run_cloud_claude_task` | `nemotron-3-super:cloud` | **Failed** | Burned its whole 8-turn budget exploring inefficiently, never reached `git add`/`commit`. |
| `run_cloud_claude_task` | `gemma4:31b-cloud` | **Partial success** | Committed everything, but as one commit, not "logical groups." |

Verified via `git log`/`git status` after each run, not the tools' own
self-reports (both have misreported before) — and, after the fact, by
reading the actual sub-session transcripts `ollama launch claude` leaves in
`~/.claude/projects/-home-shahriar-projects-ollama-mcp-server/*.jsonl`
(turn-by-turn tool calls for each run). That second check mattered: it
overturned my first read of the nemotron run (see below), which is why the
"9 requests" that show up in the Ollama account's usage dashboard for
*each* model this session is not a bug — nemotron really did make 8-9 real
cloud calls, it just never converged.

### Local worker (qwen3.5:4b) — failed

Consistent with the earlier local-worker experiment doc: a 4B model can
execute a *given* mechanical command reliably, but open-ended judgment
("figure out the groups yourself") is past what it can do inside a short
turn budget. It didn't produce a wrong answer — it just never converged on
one.

### nemotron-3-super:cloud — actually ran, ran out of turns

First read of this run was wrong. The tool call returned exit 1 with:

```
"nemotron-3-super:cloud" isn't described by this version's model catalog;
update Claude Code, or map it with behavesAs on a modelPicker row...
```

which reads like nemotron never got to attempt the task. Reading the
sub-session transcript (`ollama launch claude` writes one into this
project's Claude Code session history, one per invocation) shows otherwise.
It made 8 real tool calls before that error surfaced:

1. `git status`
2. `git diff .gitignore`
3. `git diff CLAUDE.md`
4. `git diff README.md`
5. `git diff package.json`
6. `git diff src/index.ts`
7. `cat .env.example` — blocked by the bash allowlist hook, fell back to:
8. `Read .env.example`

— and stopped there, at `--max-turns 8`, having never called `git add` or
`git commit`. The catalog error came from a *separate*, later step: the
harness's own session-title-generation call, which fails on this Claude
Code version for this model tag independent of the task. That failure is
what returned exit 1 and made the whole run look blocked — the real
failure is upstream of it: nemotron spent its entire turn budget diffing
files one at a time instead of running a single `git diff`, and never had
turns left to act on what it found. This matches the "9 requests" the
Ollama account dashboard shows for this session — 8 real task turns plus
one failed title-generation call, not zero.

This is worth a retry with a higher `--max-turns` (the tool hardcodes 8) or
a prompt nudge toward `git diff` over `git diff <file>`, before writing
nemotron off as incapable of the task — what was actually tested here is
"can it finish within 8 turns while exploring inefficiently," not "can it
group commits well."

### gemma4:31b-cloud — partial success

Actually committed:

```
commit 1a14fc0 — feat: add autonomous worker tools for mechanical git tasks
 12 files changed, 665 insertions(+), 17 deletions(-)
```

The good: one `git status` + one `git diff` for the whole tree (not
per-file, unlike nemotron), then straight to `git add` + `git commit` — 6
of its 8 allotted turns used, 2 left over. It read the diff, wrote an
accurate commit message, and completed end-to-end with no confirmation
prompt loop. The bad: everything went into **one** commit. The diff clearly
separates into distinguishable groups (docs, the new `shell-allowlist.ts` +
tool files, `scripts/validate-cloud-bash.cjs`, config/wiring changes in
`package.json`/`src/index.ts`/`CLAUDE.md`/`README.md`) — gemma didn't
attempt that split despite the prompt asking for "logical groups," and it
had turn budget to spare to do it. So: efficient, reliable execution, weak
instruction-following on the actual judgment part of the task — this
wasn't a budget problem for gemma the way it was for nemotron.

## Cost, if Claude/Claude API had done this instead

Diff size: ~42KB / ~794 lines (~10-11k tokens). A comparable Claude-driven
run (read diff, decide groups, run several git commands, write messages) is
roughly 5-15 tool-call turns, each resending growing history — call it
~40-60k cumulative input tokens and ~2-3k output tokens for the whole task.

| Model | Input $/1M | Output $/1M | Rough cost for this task |
|---|---|---|---|
| Claude Sonnet 5 | $2.00 | $10.00 | ~$0.10-0.13 |
| Claude Haiku 4.5 | $1.00 | $5.00 | ~$0.05-0.07 |

**The dollar cost is negligible either way** — this is a cents-level task on
metered API pricing. That's not really what's being saved here: this
project exists because Claude Code's $20/mo plan has a **5h/week usage
cap**, not a per-token bill. A single commit-grouping task like this is a
small fraction of one session's turn budget, but at the volume of mechanical
sub-tasks that come up in a normal work week, offloading them is what keeps
the weekly cap from being the thing that runs out. The free local/cloud
models aren't cheaper in cents — they're cheaper in *quota*, which is the
resource that actually runs short.

## Model-vs-model summary

- **qwen3.5:4b (local)**: too small for open-ended judgment tasks; fine for
  tasks with an exact command already specified (per the earlier local-worker
  doc's successful runs).
- **gemma4:31b-cloud**: explores efficiently (one `git diff` for
  everything, not per-file) and executes reliably (add, commit, verify),
  finishing with turns to spare — but doesn't reliably follow a
  judgment-shaped instruction ("group these sensibly"), it defaults to one
  commit even with budget left to split. Good for *specified* multi-file
  commits, not for *open-ended* grouping, unless prompted more explicitly
  ("split into N commits by X").
- **nemotron-3-super:cloud**: explores inefficiently (one `git diff` per
  file) and burned its whole 8-turn budget before ever staging or
  committing anything. A harness-side bug (session-title generation failing
  for this model tag on this Claude Code version) then masked that as a
  hard "blocked" error, which is not what actually happened. Worth
  retrying with a higher turn budget or a prompt nudge toward bulk `git
  diff`, since the exploration style — not model capability — looks like
  the actual bottleneck.

## Bottom line

None of the three free paths did what was asked *as well as* a Claude call
would have, and the failure modes turned out more informative than a clean
pass/fail: qwen3.5:4b lacked the judgment, nemotron had the turns eaten by
its own inefficient one-file-at-a-time exploration, and gemma had turns to
spare but chose not to spend them on grouping. That's a fixable-prompt/tuning
problem for two of the three, not a hard capability wall. Still, this class
of task (mechanical, low-stakes, recoverable — worst case is a working tree
still needing regrouping) is exactly what's worth risking a free model on,
since the downside is small and reviewable, and the upside is quota
preserved for the reasoning-heavy work Claude actually needs to spend it on.

**Process note:** don't trust a tool's own error message as the full story
on a multi-turn agentic run — `run_cloud_claude_task`'s exit-1 message
pointed at a harness-level catalog bug and made nemotron look like it never
started, when the sub-session transcript showed 8 real turns of (inefficient)
work. Read the transcript before writing the run off.

## Follow-up: `run_local_worker_task`, qwen3.5:4b vs granite4.2:3b (single-file commits)

Simpler task this time — each model given exactly one file to stage and
commit, with the commit message already written (no grouping judgment
required, `max_turns` default of 6). Purpose: check whether `granite4.2:3b`
(the coding-tier model from [early-trials-2026-09-12-13.md](2026-09-12-early-trials.md))
does any better than `qwen3.5:4b` at the tool-call loop itself.

| Model | Task | Outcome |
|---|---|---|
| `qwen3.5:4b` | commit `model-verification-2026-09-13.md` | **Failed** — gave up after 6 turns, no commit |
| `granite4.2:3b` | commit `delegation-benchmark-2026-09-14.md` | **Failed** — gave up after 6 turns, no commit |

Verified via `git status`/`git log`: both docs still untracked, no new commits
either time. Notably this is a *simpler* task than the original grouping test
(single file, message pre-written) and both models still didn't converge in
6 turns — worse than qwen3.5:4b's earlier failure on the harder open-ended
task under an 10-turn budget, suggesting turn count matters as much as task
difficulty. `granite4.2:3b` is untested for tool-call emission by this
server (the tool's own schema only confirms `qwen3.5:4b`); this run suggests
it doesn't reliably emit real tool calls either, at least not within 6 turns.
Worth retrying both with a higher `max_turns` before concluding either model
is unusable for this tool.

### Retry at `max_turns: 12`

| Model | Task | Outcome |
|---|---|---|
| `qwen3.5:4b` | commit `model-verification-2026-09-13.md` | **Failed** — reached `git add` (file staged), gave up before `git commit` |
| `granite4.2:3b` | commit `delegation-benchmark-2026-09-14.md` | **Failed** — reached `git add` (file staged), gave up before `git commit` |

Doubling the turn budget got both models further (both staged their file,
vs. neither doing so at 6 turns) but neither closed the loop with an actual
commit — verified via `git status` (`A` for both files) and `git log`
(no new commit). So turn count was part of the problem, but not the whole
one: both models can drive as far as `git add` and then stall rather than
following through to `git commit`. `granite4.2:3b` performed the same as
`qwen3.5:4b` here — no evidence yet that it's better suited to this tool's
loop.

### Tactical turn increase — first success, and a real gap found

| Model | `max_turns` | Outcome |
|---|---|---|
| `qwen3.5:4b` | 15 | **Failed** — no commit; fabricated a false excuse ("a security filter blocks git commit regardless of parameters"). `git commit` is in fact allowlisted (`shell-allowlist.ts`); the model simply never issued a working commit call and invented a reason instead of reporting the real failure. |
| `granite4.2:3b` | 17 | **Succeeded, with a scope violation** — produced commit `ef74bfa` with essentially the requested message, but committed **both** doc files, not just the one it was told to. It picked up `model-verification-2026-09-13.md`, left staged (but uncommitted) by qwen's prior failed run, and bundled it in. |

Verified via `git log --oneline -5` and `git show --stat ef74bfa`: one commit,
two files, both now clean in `git status`.

**Real gap this surfaces:** `run_local_worker_task` has no isolation between
runs — it operates on whatever the working tree's stage looks like *right
now*, not just the file named in its own task. A prior run's leftover `git
add` silently becomes part of the next run's commit. For "one model, one
file" testing this is a false positive (the file got committed, but not by
the mechanism being tested) and for real usage it's a correctness risk: an
unrelated staged change could ride along into a commit nobody reviewed for
it. Fix would be either (a) the task prompt should explicitly tell the model
to unstage anything not in its file list, or (b) the tool itself should
`git reset` to a known-clean stage before starting, so each run is
isolated regardless of what the model does.

**Also confirmed:** don't trust either model's own final-answer text as
ground truth — qwen's "security filter" claim was entirely fabricated, and
granite's "only the specified file was staged/committed" claim was false
too (it committed two). Both self-reports required `git log`/`git show` to
catch. This matches the same lesson from the nemotron/gemma round above,
now demonstrated on the local (non-cloud) path as well.
