# Local worker benchmarks — master record

All measured numbers from the Ollama worker benchmarking series. Raw
requests, responses and VRAM logs are **not** in git — see
[README.md](README.md) for where they live and why.

Every result below is **one deterministic completion per model per task**
(temperature 0, seed 42). This is a failure-mode map, not a reliability
estimate.

## Current recommendation

| Task shape | Route | Config |
|---|---|---|
| Precise ordering / spec-sensitive code fixes | `granite4.2:3b` | `think:true`, `num_ctx:16384`, `num_predict:16384` |
| Extraction, summaries, general mechanical work | `qwen3.5:4b` | `think:false`, `num_ctx:16384`, `num_predict:16384` |
| Fast throwaway mechanical code | `qwen2.5-coder:3b` | `think:false` |
| Bounded code needing cloud quality | `gemma4:31b-cloud` | `think:false` |

`granite4.2:3b` + `think:true` is the best result in the whole series: the
smallest model tested (2.2 GB) to pass all three fixtures cleanly, including
the `fix` ordering case no `think:false` model at any size solved. It costs
21-63s per task versus 2-8s for `think:false`, so keep it opt-in.

This supersedes the older `qwen3.5:4b` + `think:true` recommendation — same
correctness, but granite is faster (63s/54s vs 93s/109s on fix/summary) and
smaller.

**Do not enable `think:true` globally.** It only works when `num_predict` is
large enough (16K); at the old 512-4096 budgets it makes every previously
passing result fail.

`ministral-3:3b` (`think:false` only, no thinking support) is the dark
horse: the only model in the whole `think:false` series to solve `fix` 6/6,
at 2.33s. It doesn't unseat `granite4.2:3b` + `think:true` yet — its summary
overruns the 90-word cap — but for fix-shaped tasks it may beat the 21-63s
`think:true` route outright. Details in
[the 16K series](runs/2026-09-15-16k-context.md).

## Winners and losers, at a glance

| | Model | Why |
|---|---|---|
| 🏆 Best overall | `granite4.2:3b` (`think:true`) | Only model to pass all 3 fixtures; smallest weights tested |
| 🏆 Best `think:false` fix | `ministral-3:3b` | Only `think:false` model to solve fix 6/6, in ~2s |
| 🏆 Best cloud | `gemma4:31b-cloud` | 6/6 fix, fast, but needs cloud access |
| ❌ Worst value | `granite4.2:8b` | Bigger than the 3b variant, worse scores, CPU spillover |
| ❌ Consistently broken | `deepseek-r1:7b`, `nemotron-mini:4b` | Emit prose instead of code on `fix` — 0/6 |
| ❌ Avoid for `fix` | Any model using plain `Map.values()` ordering | First-insertion bug, not last-occurrence — see per-case tables |

## The fixture

Three tasks, unchanged across every run since 2026-09-14, which is what makes
the runs comparable.

- **extract** — parse 5 log records into an exact, ordered, typed JSON array.
  Traps: an INFO line mentioning "ERROR", an ERROR whose `request_id` appears
  only inside quoted message text (correct answer is `null`), and `line` must
  be a number, not a string.
- **fix** — repair a `uniqueLast` function: keep the last row per string ID,
  ordered by those rows' **last** positions in the input; don't mutate input;
  handle `__proto__`, `constructor`, integer-like IDs, empty input. Graded by
  executing the output in a bounded Node VM against 6 cases: `empty`,
  `last-occurrence-order`, `distinct-order`, `special-ids`,
  `integer-like-ids`, `repeated-one`. Markdown fences fail the format
  contract separately from behavior.
- **summary** — at most 90 words, must preserve the rollback-failure caveat
  and reject an unsupported 70% quota-saving claim.

The 6 fix cases test one generated function, not six independent tasks.

## Series, by test configuration

Each of these ran the fixture above under a different context/output budget
or model set. Open one when you need the reasoning behind a number, not just
the number itself.

- [16K context / 16K output](runs/2026-09-15-16k-context.md) — the current
  series. `think:false` and `think:true` head-to-head, matched-budget
  speedup comparison, GPU residency.
- [8K context, qwen2.5-coder:7b only](runs/2026-09-15-8k-context-coder.md) —
  checks whether a smaller context budget changes anything for a
  `think:true`-incapable model.
- [New models, 2026-09-15](runs/2026-09-15-new-models.md) — nine
  newly-pulled tags (exaone-deep, deepseek-r1, gemma3/4, nemotron, lfm2.5,
  ministral-3:8b) benchmarked against the same fixture, plus a rerun of the
  five survivors at a uniform 16K/16K after most large tags were removed.
  None beat the recommendation above. Notably, `exaone-deep:7.8b`'s 6/6 `fix`
  result from the 8K pass did not reproduce at 16K (dropped to 2/6, different
  bug) — don't treat a single-context result as context-independent.
- [32K context / 512 output](runs/2026-09-14-32k-context.md) — the earlier,
  superseded series. Kept because it's the source of the `think:false` fix
  result and the phi4-mini non-reproducing anomaly, plus the thinking-budget
  threshold sweep and 32K GPU residency data.
- [Agentic delegation](runs/2026-09-14-agentic-delegation.md) — a different
  question: can a model drive a git task to completion (worker-tool and
  cloud-harness runs).
- [Early trials, 2026-09-12/13](runs/2026-09-12-early-trials.md) —
  the pre-fixture single-prompt trials that found the `think:false` bug.

## Hardware and runtime

- Ollama **0.33.3**, NVIDIA GTX 1660 Super **6,144 MiB**, ~15 GiB usable RAM,
  Ryzen 5 3600X.
- `OLLAMA_CONTEXT_LENGTH=32768`, `OLLAMA_FLASH_ATTENTION=1`,
  `OLLAMA_KV_CACHE_TYPE=q8_0`. These were inert for a while (missing
  `[Service]` header plus a typo in the systemd override) — check they're
  actually applied before attributing a result to them.
- All weights Q4_K_M except qwen3.5:0.8b (Q8_0). This is an
  installed-artifact comparison, not a controlled equal-quantization study.

## Traps

- **Never run two Ollama requests concurrently on this GPU.** One request in
  flight, one model resident. A contaminated concurrent run already had to be
  thrown away once.
- **granite4.2:3b puts reasoning inline in `response`**, not in the separate
  `thinking` field, even with `think:true`. Any caller or grader must split on
  the last `</think>`. A naive grader concludes it produced nothing.
- **Probe `think:true` with a one-line curl before setting up a run.** Ollama
  returns `{"error": "\"<model>\" does not support thinking"}` for
  qwen2.5-coder tags, phi4-mini, and ministral-3:3b.
- **A behavior score doesn't waive the format contract.** qwen2.5-coder:7b
  scored 5/6 while wrapping its answer in a markdown fence it was told not to
  use.
- **Don't trust a worker's self-report.** See
  [benchmarks/agentic-delegation.md](runs/2026-09-14-agentic-delegation.md) — models
  in this series have fabricated a "security filter blocked me" excuse and
  claimed a single-file commit that actually touched two files.
- `generate()` in `src/ollama-client.ts` discards Ollama's `eval_count`,
  timings, `done_reason` and digest. Preserving them would make every future
  comparison cheaper.
- **`nemotron-mini:4b` silently caps at `CONTEXT 4096`** regardless of a
  requested `num_ctx:16384` — confirmed on two independent runs. Don't assume
  a requested `num_ctx` was honored; check `ollama ps` while the model is
  resident.
- **A short `keep_alive` doesn't guarantee GPU isolation between models run
  back-to-back.** `keep_alive:2m` left the previous model resident when the
  next one's requests started, splitting the GPU between two models for that
  run (see the 16K rerun in
  [new-models-2026-09-15.md](runs/2026-09-15-new-models.md)) — its
  `ollama ps` processor split isn't a clean solo measurement. Unload
  (`keep_alive:0`) or wait out the window between models when residency
  numbers matter.
- **A single-context result isn't context-independent.** `exaone-deep:7.8b`
  solved `fix` 6/6 at 8K context but dropped to 2/6 at 16K with a different
  generated bug, same prompt/seed/temperature. Don't generalize a pass/fail
  score to other context budgets without rechecking.

## Related

- [model-classification.md](model-classification.md) — models grouped by
  what they're good at (extraction, code fix, tool use, agentic driving,
  etc.), synthesized from this doc and the `benchmarks/` series.
- [local-claude-worker-experiment-2026-09-14.md](../planning/local-claude-worker-experiment.md)
  — full-harness experiment behind `run_local_worker_task`.
- [improvements-backlog.md](../planning/improvements-backlog.md) — proposed changes,
  including unresolved git-option-injection findings.

## Capability matrix Track B — public-2 screen (2026-09-15)

One serial run per local candidate using fixture `2026-09-15-public-2`.
Configuration: `think:false`, temperature 0, seed 42, `num_ctx:16384`,
`num_predict:1024`, maximum 6 turns, and a fixed structured-tool schema. Each
attempt used a fresh disposable Git repository. Raw artifacts are in the
gitignored `benchmark-data/capability-matrix-2026-09-15-public-2/` directory.

The probe is a one-turn request to call `read_file`. `NO TOOL CALL` means the
model replied without making a structured tool invocation. T1 requires a
read-only lookup, a passing focused test, and exact JSON including
`timeout_ms:65000`. G1 requires an edit only to `src/parse-port.js`, a passing
focused test, and independent hidden boundary checks.

| Model | Tool-call probe | T1 result | T1 wall time | G1 result | G1 wall time |
|---|---|---|---:|---|---:|
| `exaone-deep:2.4b` | ERROR — tools unsupported | ERROR — tools unsupported | — | ERROR — tools unsupported | — |
| `deepseek-r1:1.5b` | NO TOOL CALL | ERROR — exhausted six turns without a final answer | 11.96s | FAIL — no effective tool use or edit; hidden check failed | 8.66s |
| `gemma4:e2b` | OK | FAIL — refused call and Markdown-wrapped final JSON | 14.40s | FAIL — Markdown-wrapped final JSON | 16.96s |
| `nemotron-3-nano:4b` | OK | FAIL — did not read a fixture file | 31.10s | PASS — scope, visible test, hidden checks, and final JSON passed | 21.04s |
| `ministral-3:3b` | OK | FAIL — did not read a file and reported the wrong timeout | 13.86s | PASS — scope, visible test, hidden checks, and final JSON passed | 11.85s |
| `qwen2.5-coder:7b` | NO TOOL CALL | FAIL — emitted pseudo-tool JSON; no calls ran | 11.70s | FAIL — emitted pseudo-tool JSON; no edit | 18.43s |
| `granite4.2:3b` | OK | ERROR — exhausted six turns without a final answer | 14.16s | ERROR — exhausted six turns without a final answer | 16.00s |
| `qwen2.5-coder:3b` | NO TOOL CALL | FAIL — emitted pseudo-tool JSON; no calls ran | 9.75s | FAIL — emitted pseudo-tool JSON; no edit | 8.26s |
| `qwen3.5:4b` | OK | FAIL — omitted required `timeout_ms:65000` | 6.08s | PASS — scope, visible test, hidden checks, and final JSON passed | 7.99s |

This is an initial capability screen, not a routing recommendation. The G1
passes (`qwen3.5:4b`, `nemotron-3-nano:4b`, and `ministral-3:3b`) need the
plan's repeated public-fixture and held-out confirmation runs. No candidate
passed T1 under this exact contract.

## Capability matrix Track B — public-2 diagnosis, confirmation, and held-out (2026-09-16)

T1's near-miss (`qwen3.5:4b`, missing `timeout_ms:65000`) was fixed by a
final-report wording reminder and passed 5/5 public-fixture confirmation.
The three G1 screen passers were confirmed 5x each: `qwen3.5:4b` and
`nemotron-3-nano:4b` both 5/5, `ministral-3:3b` 4/5 (one Markdown-fenced
final JSON — a contract failure, excluded from G1 routing). All finalists
then ran once against a held-out fixture with renamed identifiers (T1 and
both surviving G1 routes) and passed. Full run-by-run tables, wall times, and
raw-artifact paths are in
[capability-matrix-results.md](runs/2026-09-16-capability-matrix-results.md#track-b--public-2-diagnosis-and-confirmation)
(diagnosis/confirmation) and
[...#track-b--held-out-confirmation-phase-4](runs/2026-09-16-capability-matrix-results.md#track-b--held-out-confirmation-phase-4)
(held-out).

## Capability matrix Track B — routing recommendation (2026-09-16)

Per-category, not a single best model, per the plan's decision rule:

| Category | Recommended route | Evidence | Notes |
|---|---|---|---|
| Tool use (T1: read-only lookup + focused test + exact report) | `qwen3.5:4b` with the final-report reminder | Screen FAIL (missing field) → diagnostic 5/5 public → 1/1 held-out | The reminder is load-bearing: plain baseline T1 phrasing failed the screen. No other local candidate passed T1 under any variant tested. |
| Scoped repository edit (G1: single-file edit + visible/hidden tests + exact report) | `qwen3.5:4b` or `nemotron-3-nano:4b` | Screen PASS → 5/5 public confirmation → 1/1 held-out, both models | Either is reliable for this fixture family; `nemotron-3-nano:4b` had wider per-run latency variance (6.89–21.04s public) than `qwen3.5:4b` (7.61–7.99s public). |
| Scoped repository edit — excluded | `ministral-3:3b` | Screen PASS → public confirmation 4/5 (Markdown-fenced final JSON) | Hard contract failure under this configuration; not re-run held-out. Do not route G1 traffic here without a prompt change that specifically targets bare-JSON output. |

All other categories (extraction, code fix, investigation, retrieval,
summary, incomplete evidence, instruction conflict) remain screen-only
results in [capability-matrix-results.md](runs/2026-09-16-capability-matrix-results.md)
and are not yet promoted to a routing recommendation. Cloud routes stay
`ON HOLD`.

## Track A — Phase 3 reliability confirmation (2026-09-16)

Every category's Phase-1 finalist (28 model/category pairs across E1, F1,
I1, R1, S1, U1, C1) was rerun 5 times against the unchanged public fixture
and settings. All 28 reproduced 5/5 — no crash, timeout, or flip from PASS
to FAIL. Full per-pair timing and the grader bug this run caught (F1's
`instanceof TypeError` check failing across the `vm` sandbox realm, fixed to
`error.name === "TypeError"`) are in
[capability-matrix-results.md](runs/2026-09-16-capability-matrix-results.md#track-a--phase-3-reliability-confirmation-2026-09-16).

This confirms infra-level repeatability under fixed temperature-0/seed-42
settings, not sampling-level variability or generalization past the public
fixture.

## Track A — Phase 4 held-out confirmation (2026-09-16)

Every category's finalist(s) ran once against a held-out fixture with
renamed identifiers, reordered logs, and relocated defects (same task
contract as the public fixture). 26/28 pairs generalized; full detail,
including two grader false negatives found and fixed during grading (not
model failures), is in
[capability-matrix-results.md](runs/2026-09-16-capability-matrix-results.md#track-a--phase-4-held-out-confirmation-2026-09-16).

| Category | Recommended route | Evidence | Notes |
|---|---|---|---|
| Extraction (E1) | `nemotron-3-nano:4b`, `granite4.2:3b`, or `qwen3.5:4b` | Phase 1 PASS → 5/5 Phase 3 → 1/1 held-out, all three | |
| Spec-sensitive code fix (F1) | `nemotron-3-nano:4b`, `qwen2.5-coder:7b`, `qwen3.5:4b`, or `granite4.2:3b` (`think:true`) | Phase 1 PASS → 5/5 Phase 3 → 1/1 held-out | `ministral-3:3b` excluded: passed Phase 3 5/5 but the held-out repair threw a runtime error — a genuine behavior bug, not just a format miss. |
| Investigation (I1) | `qwen3.5:4b` | Phase 1 PASS → 5/5 Phase 3 → 1/1 held-out | Only finalist tested for this category. |
| Retrieval (R1) | `gemma4:e2b`, `nemotron-3-nano:4b`, `ministral-3:3b`, `granite4.2:3b`, or `qwen3.5:4b` | Phase 1 PASS → 5/5 Phase 3 → 1/1 held-out, all five | |
| Summary (S1) | `nemotron-3-nano:4b`, `granite4.2:3b`, or `qwen3.5:4b` | Phase 1 PASS → 5/5 Phase 3 → 1/1 held-out, all three | |
| Incomplete evidence (U1) | `qwen2.5-coder:7b`, `granite4.2:3b`, or `qwen3.5:4b` | Phase 1 PASS → 5/5 Phase 3 → 1/1 held-out | `gemma4:e2b` excluded: held-out response asked only for generic "upstream logs," not specifically the timing/duration/latency evidence the fixture requires. |
| Instruction conflict (C1) | `gemma4:e2b`, `nemotron-3-nano:4b`, `ministral-3:3b`, `qwen2.5-coder:7b`, `granite4.2:3b`, `qwen2.5-coder:3b`, or `qwen3.5:4b` | Phase 1 PASS → 5/5 Phase 3 → 1/1 held-out, all seven | |

This closes the same generalization gate already applied to Track B. Track A
is now eligible for routing, per-category above; cloud routes stay `ON
HOLD`.

`ministral-3:3b` (F1) and `gemma4:e2b` (U1) both passed Phase 1 and all 5
Phase 3 public-fixture runs, then failed on first exposure to the held-out
fixture — a genuine behavior miss (F1) and a scope miss (U1), not a format
bug. Per the plan, Phase 2 (change-one-factor diagnosis) runs against
near-misses found *before* the held-out stage, using variants of the public
fixture; there is no second held-out fixture to diagnose against without
spending the one held-out draw the routing decision already relied on. No
Phase 2 follow-up is planned for these two — they stay excluded from F1 and
U1 routing as recorded above.

## Capability matrix — combined routing recommendation (2026-09-16)

One per-category table across both tracks, per the plan's decision rule
("a per-category routing table, not a single best model label"). Rows below
restate the Track A and Track B tables above; see those sections for
evidence chains.

| Category | Recommended route(s) | Excluded (tested, failed) |
|---|---|---|
| Strict extraction (E1) | `nemotron-3-nano:4b`, `granite4.2:3b`, `qwen3.5:4b` | — |
| Spec-sensitive code fix (F1) | `nemotron-3-nano:4b`, `qwen2.5-coder:7b`, `qwen3.5:4b`, `granite4.2:3b` (`think:true`) | `ministral-3:3b` (held-out runtime error) |
| Bug investigation (I1) | `qwen3.5:4b` | — (only finalist tested) |
| Long-context retrieval (R1) | `gemma4:e2b`, `nemotron-3-nano:4b`, `ministral-3:3b`, `granite4.2:3b`, `qwen3.5:4b` | — |
| Summary fidelity (S1) | `nemotron-3-nano:4b`, `granite4.2:3b`, `qwen3.5:4b` | — |
| Incomplete evidence (U1) | `qwen2.5-coder:7b`, `granite4.2:3b`, `qwen3.5:4b` | `gemma4:e2b` (held-out asked for generic evidence, not specifically timing data) |
| Instruction conflict (C1) | `gemma4:e2b`, `nemotron-3-nano:4b`, `ministral-3:3b`, `qwen2.5-coder:7b`, `granite4.2:3b`, `qwen2.5-coder:3b`, `qwen3.5:4b` | — |
| Tool use (T1) | `qwen3.5:4b` with the final-report reminder | all other candidates (screen FAIL) |
| Scoped repository edit (G1) | `qwen3.5:4b`, `nemotron-3-nano:4b` | `ministral-3:3b` (Markdown-fenced final JSON, 4/5 public) |

Cloud routes (`gemma4:31b-cloud`, `nemotron-3-super:cloud`) remain `ON HOLD`
pending an explicit decision on the cloud route, cost/privacy constraints,
and evaluation budget — no category above includes a cloud recommendation.

## Follow-up probe: does a bigger output budget change anything? (2026-09-16)

Two Phase-1 screens ran at a small `num_predict` (I1 at 512; `exaone-deep:2.4b`
mostly blocked entirely by a `q8_0` KV-cache incompatibility, with one f16
attempt at 1024 that exhausted its budget mid-reasoning). Both looked like
plausible truncation artifacts rather than genuine capability gaps, following
the same pattern that made `granite4.2:3b` + `think:true` + 16K predict the
best result in the series. Reran both at `num_predict:16384` to check.
Raw artifacts: `benchmark-data/capability-matrix-2026-09-16-i1-predict16k/`
and `benchmark-data/capability-matrix-2026-09-16-exaone-f16/`.

**I1 losers at 16K predict: no recovery, budget was never the constraint.**
All 7 non-winning Phase-1 models (`deepseek-r1:1.5b`, `gemma4:e2b`,
`nemotron-3-nano:4b`, `ministral-3:3b`, `qwen2.5-coder:7b`, `granite4.2:3b`,
`qwen2.5-coder:3b`) still FAILed on the same "does not cite the required
line" check. Every attempt finished with `done_reason:"stop"`, well under
the cap — `granite4.2:3b` used 8,854 of 16,384 tokens and still stopped on
its own. This was a genuine citation-accuracy gap, not truncation; no change
to the I1 routing recommendation.

**`exaone-deep:2.4b` on an isolated f16 KV-cache server at 16K predict:
one new pass (R1), rest still fail for real reasons.**

| Fixture | Result | Tokens/cap | `done_reason` | Why |
|---|---|---|---|---|
| E1 | FAIL | 6,945/16,384 | `stop` | Finished, closed `</thought>` cleanly, but wrapped the JSON answer in a ```` ```json ```` fence — a format-contract violation, not truncation |
| F1 | FAIL | 2,272/16,384 | `stop` | Same pattern: closed `</thought>` cleanly, correct-looking code, but fenced in ```` ```javascript ```` |
| I1 | FAIL | 16,384/16,384 | `length` | Genuinely truncated mid-reasoning; still didn't cite the required lines even before the cutoff |
| R1 | **PASS** | 686/16,384 | `stop` | Clean answer, no reasoning leak; previously `ERROR` (couldn't load under `q8_0`) |
| S1 | FAIL | 16,384/16,384 | `length` | Genuinely truncated; never reached a compliant summary |
| U1 | FAIL | 558/16,384 | `stop` | Finished, but asserted an unsupported cause and exceeded the word cap — a content gap |
| C1 | FAIL | 359/16,384 | `stop` | Finished, but did not return the exact required string — a content gap |

f16 does fix the loading error, and R1 is a genuine, budget-independent
recovery — `exaone-deep:2.4b` is now a plausible additional R1 candidate,
though it needs the plan's Phase 3/5-repeat and held-out confirmation before
joining the R1 routing recommendation above; it is not yet promoted. E1/F1
show the model reasons correctly but has a standing habit of fencing its
final answer regardless of output budget — a prompt-format problem, not a
budget or KV-cache one. I1/S1 show this model is genuinely too verbose a
reasoner for even a 16K budget on those two tasks. U1/C1 fail on content
regardless of budget or cache type. Net: raising `num_predict` and moving to
`f16` recovers exactly the failures that were actually truncation-shaped,
and does not fix the ones that weren't — the diagnostic worked as intended
even though most of the individual bets did not pay off.

## Local-explorer pilot — a different question (2026-09-16)

Not "is a model's output correct" but "can a local model with only
Glob/Grep/Read absorb repo-discovery tool calls ahead of Haiku/Sonnet."
Full writeup: [benchmarks/local-explorer-2026-09-16.md](runs/2026-09-16-local-explorer.md).

Five real exploration questions about this repo's own source, run through a
throwaway tool-calling harness:

| Model | Correct | Tool calls (5 tasks) | Wall time | Verdict |
|---|---|---|---|---|
| `qwen3.5:4b` | 4/5 | 27 | 88.4s | 1 hallucination, but self-flagged `Confidence: low` — a confidence-gated router would have escalated it |
| `qwen2.5-coder:7b` | 0/1 tested | 0 (no real `tool_calls`) | 15.9s | disqualified — fabricates files (invented `.py` files in a 100% TS repo) at `Confidence: high` |
| `granite4.2:3b` | 1/1 tested | 9 (full budget) | 30.7s | correct but wasteful path-guessing before it grepped |
| Haiku (`Explore` subagent) | 5/5 | 9 | 26.9s | beat the local tier on accuracy, tool-call count, *and* wall time |

**Not yet worth wiring in as a default tier.** On a repo this small, Haiku's
own exploration is already cheap — the local tier's savings would only
appear on much larger repos/tasks where Haiku's own tool-call cost is what's
being optimized away, which this pilot didn't test. `qwen2.5-coder:7b`
should not be used for this tier at all (overrides the original suggestion
to start with it); `qwen3.5:4b` is the only viable local candidate, and only
paired with a confidence gate that escalates low-confidence answers to
Haiku rather than trusting them. Screen-only evidence (5 tasks, one repo,
one run each) — needs the ~20-task scale before any routing default changes.

## `local_explorer_task` budget increase + `think:true` (2026-09-18)

Widened the tool's defaults — `max_tool_calls` 8→24, `max_files_read` 5→10,
`max_output_chars` 3000→6000, added an explicit `num_predict:8192` (was
unset anywhere in the codebase before this), a 180s per-call request
timeout (`AbortController`, guards a hung generation — the loop had no
timeout at all before), and a new `think` param (default `false`). Ran
`qwen3.5:4b` against the ten still-unscored gold questions SE-13..SE-22
(from [gold-set-cli.ts](../../src/super-explorer/gold-set-cli.ts)), once with
`think:false` and once with `think:true`, 20s pause between questions, same
repo/questions/model both times. Raw output:
[benchmark-data/se13-22-runner/](../../benchmark-data/se13-22-runner/) (gitignored).

| Config | Score | Total wall time (10 Qs) | Notes |
|---|---|---|---|
| `think:false` | 7/10 | 290s | SE-13 hallucinated "no such thing in this repo" for a file another question found fine minutes later; SE-17 self-flagged `Confidence: low` after failing to find `hybridRetrieve` (correct gate behavior on a wrong answer); SE-15 was substantively correct but described the retry as a "repair attempt" and claimed "no recovery mechanism", which undersells what actually happens |
| `think:true` | 10/10 | 586.3s | Same SE-13 question now finds `discovery.ts` and `discover-evidence.ts` directly with real file:line citations, `Confidence: high` |

**Reading it:** `think:true` roughly doubled wall time (29s/question avg vs
58s/question avg) but fixed every miss from the `think:false` pass,
including the one case (SE-13) that wasn't just under-confident but
actively wrong. On this 10-question batch the accuracy gain looks worth the
time cost for anything where the answer will be trusted downstream; for
throwaway/low-stakes lookups `think:false` plus the confidence gate is still
the cheaper default. n=10, one run each — same "needs more scale" caveat as
every other row in this file before this becomes a hard default.
