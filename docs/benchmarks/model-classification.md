# Model classification by task type

What each benchmarked model is actually good at, synthesized from
[MASTER.md](MASTER.md) and the `benchmarks/` series. This is a
reference for picking a model given a task shape — routing recommendations
with evidence chains live in BENCHMARKS.md; this doc groups them by "what
kind of work."

All results are from the capability-matrix fixture family (`think:false`,
temp 0, seed 42, ctx 16K unless noted) plus the earlier fix/extract/summary
fixture. Single-run capability screens are noted as such — treat them as
weaker evidence than the categories with Phase 3 (5x repeat) + Phase 4
(held-out) confirmation.

## Quick picks by task type

| I need to... | Use | Why |
|---|---|---|
| Extract strict/typed JSON from messy text | `nemotron-3-nano:4b`, `granite4.2:3b`, or `qwen3.5:4b` | E1: Phase 1→3→4 confirmed, all three |
| Fix a spec-sensitive bug (ordering, edge cases, `__proto__`) | `nemotron-3-nano:4b`, `qwen2.5-coder:7b`, `qwen3.5:4b`, or `granite4.2:3b` (`think:true`) | F1: Phase 1→3→4 confirmed |
| Investigate a bug and cite the exact lines | `qwen3.5:4b` | I1: only finalist, but Phase 1→3→4 confirmed |
| Retrieve one fact from a long document, with citation | `gemma4:e2b`, `nemotron-3-nano:4b`, `ministral-3:3b`, `granite4.2:3b`, or `qwen3.5:4b` | R1: Phase 1→3→4 confirmed, all five |
| Summarize while preserving a specific caveat, under a word cap | `nemotron-3-nano:4b`, `granite4.2:3b`, or `qwen3.5:4b` | S1: Phase 1→3→4 confirmed |
| Decline gracefully on incomplete evidence | `qwen2.5-coder:7b`, `granite4.2:3b`, or `qwen3.5:4b` | U1: Phase 1→3→4 confirmed |
| Hold to an exact required output under instruction conflict | any of `gemma4:e2b`, `nemotron-3-nano:4b`, `ministral-3:3b`, `qwen2.5-coder:7b`, `granite4.2:3b`, `qwen2.5-coder:3b`, `qwen3.5:4b` | C1: Phase 1→3→4 confirmed, all seven |
| Make one read-only tool call and report exact structured output | `qwen3.5:4b` **with a final-report reminder prompt** | T1: the reminder is load-bearing — plain phrasing fails |
| Make a single scoped file edit + pass tests + report | `qwen3.5:4b` or `nemotron-3-nano:4b` | G1: public 5/5 → held-out confirmed, both |
| Drive an open-ended multi-turn agentic task to completion (e.g. "commit these in logical groups") | **none reliably** — see [Agentic driving](#agentic-driving-open-ended-multi-turn) | All three tested paths failed or only partially succeeded |

## Per-model profile

### `qwen3.5:4b` — generalist, the only one that passes everything tested
The broadest confirmed range of any model in the series: passes every
Track A category (E1, F1, I1, R1, S1, U1, C1) and is the *only* confirmed
route for I1 (bug investigation) and T1 (tool-use with exact report,
needs a prompt reminder). Slower than the smaller specialists (7-15s vs
3-8s typically) but that's the tradeoff for range. Current default
recommendation for "extraction, summaries, general mechanical work."
Fails at open-ended agentic driving (gave up after 10 turns on the
commit-grouping task; also failed the single-file commit test up to
`max_turns:12`, and at 15 turns fabricated a false "security filter"
excuse instead of reporting failure — see
[agentic-delegation.md](runs/2026-09-14-agentic-delegation.md)).

### `granite4.2:3b` — best structured/spec-sensitive coder, at a real time cost
The `think:true` config is the single best result across the whole
fix/extract/summary series: smallest model tested (2.2GB) to pass all
three original fixtures, including the ordering case (`fix`) no
`think:false` model at any size solved. Confirmed on E1, F1 (`think:true`
only — `think:false` fails F1, returning an object instead of the
required `Map`), S1, U1, C1, R1 in the newer capability matrix too.
Costs 21-63s per task with `think:true` vs 2-8s without — worth it only
when precision matters more than latency. Note: puts its reasoning inline
in `response`, not the separate `thinking` field, even with `think:true` —
a naive grader will conclude it produced nothing. Failed T1/G1 tool-use
screens (exhausted 6 turns without a final answer) and failed the
agentic single-file-commit test at low turn budgets, though it did
eventually succeed at `max_turns:17` (with a scope violation — committed
an extra file left staged by a prior run).

### `nemotron-3-nano:4b` — fast, broad, but format-fragile at low output budgets
Confirmed on E1, F1, R1, S1, C1, G1 (both public and held-out) — one of
the widest ranges alongside qwen3.5:4b, usually 1-2s faster per call. Weak
spot: U1 (incomplete-evidence) — declines to diagnose but doesn't ask for
the *specific* timing evidence required, so it fails that one category
consistently, including at 16K predict. Also failed the original T1
tool-call screen (didn't read a fixture file). Caveat from the older
series: **the separate, differently-named `nemotron-mini:4b` silently
caps context at 4096 regardless of requested `num_ctx`** — don't confuse
the two tags, and verify `ollama ps` before trusting a `num_ctx` was
honored.

### `qwen2.5-coder:7b` — reliable on F1/U1/C1, not the default for extraction
Passes F1 (spec-sensitive code fix) and U1 (incomplete evidence) with
Phase 1→3→4 confirmation, plus C1. Consistently fails E1 (strict
extraction) and I1 by wrapping otherwise-correct output in a Markdown
fence it was told not to use — "correct content, failed format contract"
is its signature failure mode, not a content gap. Slower than the 3-4B
specialists (8-31s). Failed T1/G1 tool-use screens (emitted pseudo-tool
JSON instead of real tool calls — doesn't support Ollama's structured
tool-calling well in this harness).

### `qwen2.5-coder:3b` — fast, narrow, C1-only reliable pick
Only confirmed reliable route is C1 (instruction conflict / exact-string
compliance), Phase 1→3→4. Fails E1, F1 (`think:false`, invalid `Map`
construction), I1, R1, S1, U1 (invents an unsupported cause) — and fails
T1/G1 the same way as its 7B sibling (pseudo-tool JSON, no real calls).
Does **not** support `think:true` at all (Ollama errors "does not support
thinking"). Useful only as the fastest throwaway option for exact-string
or narrowly-scoped mechanical tasks, per the "fast throwaway mechanical
code" slot in BENCHMARKS.md's routing table.

### `ministral-3:3b` — fast fix-solver, format-unreliable under agentic use
The `think:false` dark horse: the only `think:false`-only model (no
thinking support) to solve the original `fix` fixture 6/6, in ~2s — beats
every `think:true` model on speed. Fails E1 (Markdown-fenced), but
passes F1/R1/C1 with Phase 1→3 confirmation, and **held
out on F1 with a genuine runtime bug** (`buckets[key].push is not a
function`) despite 5/5 public-fixture passes — exclude from F1 routing
despite the earlier pass streak. On G1 (scoped edit), makes the correct
edit and passes tests but wraps its final JSON report in a Markdown fence
4/5 times — a hard format failure, not excluded from G1 by capability but
by contract compliance. U1: exceeds the 60-word cap despite otherwise
correct content. Net: good raw coding instinct, worst format discipline
of the finalist pool — needs a prompt fix targeting bare-JSON output
before it's routable for anything with a strict report contract.

### `gemma4:e2b` (local) — good at retrieval and evidence-boundary tasks, fence-prone elsewhere
Confirmed R1 (Phase 1→3→4) and C1 (Phase 1→3→4). U1: passed the original
screen and Phase 3, but **failed Phase 4 held-out** — asked for generic
"upstream logs" instead of the specifically required timing/duration/
latency evidence, a genuine scope miss, not a format bug. Fails E1
(Markdown-fenced) and F1 (`__proto__` treated as an unsafe ordinary key,
breaking the required safety check). T1 tool-use screen: made a real tool
call but then refused and Markdown-wrapped its final JSON.

### `gemma4:31b-cloud` — best cloud model tested, but poor at judgment-shaped tasks
6/6 on the original `fix` fixture — the best cloud result in the series.
On the open-ended agentic delegation test (commit uncommitted changes "in
sensible logical groups"), it explored efficiently (one `git diff` for
the whole tree, not per-file) and executed reliably (add, commit, verify,
with turns to spare) but **put everything in one commit**, ignoring the
"logical groups" instruction it had budget left to follow. Good for
*specified* multi-file operations; not for tasks requiring grouping
judgment unless the prompt is made more explicit ("split into N commits
by X").

### `nemotron-3-super:cloud` — untested capability, confirmed bad exploration habit
Only tested on the open-ended agentic delegation task, where it burned
its entire 8-turn budget running `git diff <file>` once per file instead
of one bulk `git diff`, and never reached `git add`/`commit`. A harness
bug (session-title generation failing for this tag) then made the failure
look like a hard block in the tool's own error message — reading the raw
sub-session transcript was required to find the real cause. Worth a retry
with a higher turn budget or a prompt nudge toward bulk `git diff` before
writing it off; what was tested was turn-budget/exploration-style, not
raw task capability.

### Models that failed hard and should generally be avoided
- **`deepseek-r1:1.5b`/`:7b`** — consistently leaks `<think>` reasoning into
  the final answer across every category tested (E1, F1, I1, R1, S1, U1,
  C1); emits prose instead of code on the `fix` fixture (0/6). Not a
  formatting quirk that a stricter prompt fixes — it's the model's default
  behavior in this harness.
- **`nemotron-mini:4b`** — emits prose instead of code on `fix` (0/6);
  separately, silently caps context at 4096 regardless of requested
  `num_ctx` (distinct from, and don't confuse with, `nemotron-3-nano:4b`
  above, which is a solid performer).
- **`exaone-deep:2.4b`/`:7.8b`** — mostly blocked outright by a `q8_0`
  KV-cache incompatibility (block size 32 doesn't divide its 80-wide K
  head); needs an isolated `f16` server to even load. Once loaded, has a
  standing habit of Markdown-fencing its final answer regardless of output
  budget (E1, F1 fail this way even with correct reasoning) and is too
  verbose a reasoner for I1/S1 even at 16K predict (truncates mid-answer).
  One genuine bright spot: R1 passed clean on the f16 server (686/16,384
  tokens, no truncation) — a plausible R1 candidate, but not yet promoted
  (needs Phase 3/4 confirmation).
- **`granite4.2:8b`** — worse scores than the 3b variant despite being
  bigger, plus CPU spillover on this GPU. No known use case where it beats
  `granite4.2:3b`.
- **`phi4-mini`** — a 32K-series anomaly (a passing result that didn't
  reproduce) flagged as unreliable; doesn't support `think:true`.

## Agentic driving (open-ended, multi-turn)

Distinct from single-completion output quality — this is "can a model
drive a tool-call loop to a working conclusion." Separate benchmark, see
[agentic-delegation.md](runs/2026-09-14-agentic-delegation.md).

- **Tasks with an exact command already specified** (single file, message
  pre-written): still failed at `max_turns:6` and `:12` for both
  `qwen3.5:4b` and `granite4.2:3b` — both stall after `git add`, before
  `git commit`. `granite4.2:3b` eventually succeeded at `max_turns:17`,
  but with a scope violation (committed an extra file left staged by a
  prior run — the tool has no run isolation).
- **Open-ended judgment tasks** ("group these commits sensibly"): no free
  model tested handled this well. `qwen3.5:4b` never converged;
  `nemotron-3-super:cloud` burned its turn budget on inefficient
  exploration; `gemma4:31b-cloud` executed reliably but ignored the
  grouping instruction, defaulting to one commit.
- **Don't trust any model's self-report of what it did.** Confirmed
  fabrication (`qwen3.5:4b` invented a nonexistent "security filter"
  blocking `git commit`) and false claims (`granite4.2:3b` claimed it
  committed only the requested file when it had committed two). Always
  verify via `git log`/`git status`, not the tool's own summary.
- Bottom line: this class of task is fine to *risk* on a free model
  (low-stakes, recoverable — worst case is a working tree still needing
  regrouping) but not to *trust* — review the result before relying on it.

## Cross-cutting traps (apply regardless of model)

- **`think:true` only helps at a large `num_predict`** (16K in this
  series). At old 512-4096 budgets it made every previously-passing result
  fail. Don't enable it globally.
- **A behavior pass doesn't waive the format contract.** Several models
  (`qwen2.5-coder:7b`, `ministral-3:3b`, `gemma4:e2b`) produce correct
  content but wrap it in a Markdown fence they were told not to use —
  scored as a fail, not a pass with a note.
- **A single-context or single-fixture result isn't generalizable.**
  `exaone-deep:7.8b` passed `fix` 6/6 at 8K context, dropped to 2/6 at 16K
  with a different bug. `ministral-3:3b` and `gemma4:e2b` both passed
  Phase 3 (5x repeat on the *same* fixture) and then failed on first
  exposure to a held-out fixture with renamed identifiers — reliability
  under repetition is not the same as generalization.
- **Probe `think:true` support before setting up a run** — Ollama errors
  outright for `qwen2.5-coder` tags, `phi4-mini`, and `ministral-3:3b`.
- **Cloud routes (`gemma4:31b-cloud`, `nemotron-3-super:cloud`) remain
  `ON HOLD`** for the capability-matrix categories pending an explicit
  cost/privacy/budget decision — only tested so far on the original
  fix/extract/summary fixture and the agentic delegation task.

## Evidence strength key

- **Phase 1 → 3 → 4 confirmed**: passed the initial screen, 5/5 repeat on
  the same fixture, and 1/1 on a held-out fixture with renamed
  identifiers/relocated defects. Strongest evidence in this series.
- **Public confirmation only**: passed a screen and repeat runs, no
  held-out check yet — treat as provisional.
- **Screen only**: single deterministic run (temp 0, seed 42). A failure
  mode map, not a reliability estimate — see BENCHMARKS.md's framing.
