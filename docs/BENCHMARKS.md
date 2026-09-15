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
[the 16K series](benchmarks/16k-context-series.md).

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

- [16K context / 16K output](benchmarks/16k-context-series.md) — the current
  series. `think:false` and `think:true` head-to-head, matched-budget
  speedup comparison, GPU residency.
- [8K context, qwen2.5-coder:7b only](benchmarks/8k-context-coder.md) —
  checks whether a smaller context budget changes anything for a
  `think:true`-incapable model.
- [New models, 2026-09-15](benchmarks/new-models-2026-09-15.md) — nine
  newly-pulled tags (exaone-deep, deepseek-r1, gemma3/4, nemotron, lfm2.5,
  ministral-3:8b) benchmarked against the same fixture, plus a rerun of the
  five survivors at a uniform 16K/16K after most large tags were removed.
  None beat the recommendation above. Notably, `exaone-deep:7.8b`'s 6/6 `fix`
  result from the 8K pass did not reproduce at 16K (dropped to 2/6, different
  bug) — don't treat a single-context result as context-independent.
- [32K context / 512 output](benchmarks/32k-context-series.md) — the earlier,
  superseded series. Kept because it's the source of the `think:false` fix
  result and the phi4-mini non-reproducing anomaly, plus the thinking-budget
  threshold sweep and 32K GPU residency data.
- [Agentic delegation](benchmarks/agentic-delegation.md) — a different
  question: can a model drive a git task to completion (worker-tool and
  cloud-harness runs).
- [Early trials, 2026-09-12/13](benchmarks/early-trials-2026-09-12-13.md) —
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
  [benchmarks/agentic-delegation.md](benchmarks/agentic-delegation.md) — models
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
  [new-models-2026-09-15.md](benchmarks/new-models-2026-09-15.md)) — its
  `ollama ps` processor split isn't a clean solo measurement. Unload
  (`keep_alive:0`) or wait out the window between models when residency
  numbers matter.
- **A single-context result isn't context-independent.** `exaone-deep:7.8b`
  solved `fix` 6/6 at 8K context but dropped to 2/6 at 16K with a different
  generated bug, same prompt/seed/temperature. Don't generalize a pass/fail
  score to other context budgets without rechecking.

## Related

- [local-claude-worker-experiment-2026-09-14.md](local-claude-worker-experiment-2026-09-14.md)
  — full-harness experiment behind `run_local_worker_task`.
- [improvements-backlog.md](improvements-backlog.md) — proposed changes,
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

## Capability matrix Track B — public-2 diagnosis and confirmation (2026-09-16)

The closest T1 near-miss, `qwen3.5:4b`, had completed the required behavior
but omitted `timeout_ms:65000` from its final JSON. The diagnostic changed
only the final-report wording: it required the exact object and explicitly
said not to omit the numeric timeout. Under the otherwise unchanged T1
fixture/configuration, it passed 5/5: every run read a fixture file, ran the
focused test successfully, preserved the read-only repository, and returned
the exact required report. Median wall time was 6.42s (range 6.37–13.02s).

The three G1 screen passers were also completed to five serial public-fixture
attempts, each from a fresh disposable repository. `qwen3.5:4b` passed 5/5
(median 7.72s, range 7.61–7.99s), and `nemotron-3-nano:4b` passed 5/5 (median
7.16s, range 6.89–21.04s). `ministral-3:3b` passed 4/5 (median 4.26s, range
4.09–14.59s); its sole failure made the correct edit and passed both visible
and independent tests, but wrapped the final JSON in a Markdown fence. This
is a contract failure, so it is not reliable for G1 under this configuration.

Raw artifacts use the `t1-final-report-reminder-*` and `g1-0[2-5]-*` names in
the existing gitignored `benchmark-data/capability-matrix-2026-09-15-public-2/`
directory. T1's prompt variant and full system prompt are stored in each T1
artifact. Held-out T1 and G1 fixtures remain required before any routing
recommendation.

## Capability matrix Track B — held-out confirmation (2026-09-16)

One attempt per finalist route against fixture `2026-09-16-held-out-1`, which
renames every identifier the public fixture used (T1:
`src/runtime.js`/`defaultTimeoutMs` → `src/worker-settings.js`/
`requestTimeoutMs`; G1: `src/parse-port.js`/`parsePort` →
`src/port-validator.js`/`validatePort`, with its two test assertions
reordered) while keeping the same prompts, tool schema, grading contract, and
generation settings. This checks that the public-2 passes reflected task
capability, not memorized identifiers.

| Route/config | Result | Wall time |
|---|---|---:|
| T1 `qwen3.5:4b`, final-report reminder | PASS | 16.60s |
| G1 `qwen3.5:4b` | PASS | 6.96s |
| G1 `nemotron-3-nano:4b` | PASS | 13.10s |

All three passed: each performed genuine search/read/write/test tool calls
against the renamed files and returned a contract-valid final report. Raw
artifacts are in the gitignored
`benchmark-data/capability-matrix-2026-09-16-held-out-1/` directory; full
detail is in [capability-matrix-results.md](benchmarks/capability-matrix-results.md).
`ministral-3:3b` was not re-run held-out — its public-2 confirmation already
showed a hard G1 format failure (1/5) and is excluded below.

## Capability matrix Track B — routing recommendation (2026-09-16)

Per-category, not a single best model, per the plan's decision rule:

| Category | Recommended route | Evidence | Notes |
|---|---|---|---|
| Tool use (T1: read-only lookup + focused test + exact report) | `qwen3.5:4b` with the final-report reminder | Screen FAIL (missing field) → diagnostic 5/5 public → 1/1 held-out | The reminder is load-bearing: plain baseline T1 phrasing failed the screen. No other local candidate passed T1 under any variant tested. |
| Scoped repository edit (G1: single-file edit + visible/hidden tests + exact report) | `qwen3.5:4b` or `nemotron-3-nano:4b` | Screen PASS → 5/5 public confirmation → 1/1 held-out, both models | Either is reliable for this fixture family; `nemotron-3-nano:4b` had wider per-run latency variance (6.89–21.04s public) than `qwen3.5:4b` (7.61–7.99s public). |
| Scoped repository edit — excluded | `ministral-3:3b` | Screen PASS → public confirmation 4/5 (Markdown-fenced final JSON) | Hard contract failure under this configuration; not re-run held-out. Do not route G1 traffic here without a prompt change that specifically targets bare-JSON output. |

All other categories (extraction, code fix, investigation, retrieval,
summary, incomplete evidence, instruction conflict) remain screen-only
results in [capability-matrix-results.md](benchmarks/capability-matrix-results.md)
and are not yet promoted to a routing recommendation. Cloud routes stay
`ON HOLD`.

## Track A — Phase 3 reliability confirmation (2026-09-16)

Every category's Phase-1 finalist (28 model/category pairs across E1, F1,
I1, R1, S1, U1, C1) was rerun 5 times against the unchanged public fixture
and settings. All 28 reproduced 5/5 — no crash, timeout, or flip from PASS
to FAIL. Full per-pair timing and the grader bug this run caught (F1's
`instanceof TypeError` check failing across the `vm` sandbox realm, fixed to
`error.name === "TypeError"`) are in
[capability-matrix-results.md](benchmarks/capability-matrix-results.md#track-a--phase-3-reliability-confirmation-2026-09-16).

This confirms infra-level repeatability under fixed temperature-0/seed-42
settings, not sampling-level variability or generalization past the public
fixture. Phase 4 held-out fixtures for these seven categories are still
needed before any Track A routing recommendation, the same gate already
applied to Track B.
