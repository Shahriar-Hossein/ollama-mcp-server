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

## 16K context / 16K output — the current series

`num_ctx:16384`, `num_predict:16384`, temperature 0, seed 42,
`keep_alive:2m`, strictly serial, one model resident at a time.

### `think:false`

| Model | Extract | Fix | Summary (words) | Wall: extract / fix / summary |
|---|---|---:|---|---:|
| qwen3.5:4b | PASS | 4/6 | 73 PASS | 7.98s / 3.35s / 2.93s |
| qwen2.5-coder:7b | PASS | **5/6** | 86 PASS | 13.87s / 2.19s / 5.05s |
| granite4.2:3b | PASS | 3/6 | 179 FAIL | 7.43s / 1.81s / 3.58s |
| qwen3.5:2b | FAIL | 4/6 | 88 PASS | 7.93s / 2.27s / 1.78s |
| qwen2.5-coder:3b | FAIL | 4/6 | 100 FAIL | 6.99s / 0.91s / 1.93s |
| phi4-mini:3.8b | FAIL | 4/6 | 110 FAIL | 8.90s / 1.14s / 2.35s |
| granite4.2:8b | FAIL | 3/6 | 146 FAIL | 18.22s / 10.50s / 14.78s |

Per-case fix breakdown:

| Model | empty | last-occ-order | distinct-order | special-ids | int-like-ids | repeated-one |
|---|---|---|---|---|---|---|
| qwen2.5-coder:7b | P | P | **F** | P | P | P |
| qwen3.5:4b | P | **F** | P | **F** | P | P |
| qwen2.5-coder:3b | P | **F** | P | **F** | P | P |
| phi4-mini:3.8b | P | **F** | P | **F** | P | P |
| qwen3.5:2b | P | **F** | **F** | P | P | P |
| granite4.2:3b | P | **F** | **F** | **F** | P | P |
| granite4.2:8b | P | **F** | **F** | **F** | P | P |

**No model from 2B to 8B solved `fix` cleanly with `think:false`.** The
recurring bug: build a `Map` keyed by ID, then emit `map.values()` — that is
*first-insertion* order, not last-occurrence order. It's a variant of the
exact bug the task asks them to fix. qwen2.5-coder:7b's 5/6 comes from a
`.reverse()` trick that satisfies two cases by coincidence while breaking
`distinct-order`, not from correct reasoning.

Extract failure modes: qwen3.5:2b and phi4-mini both copy the decoy message
substring into `request_id` instead of `null`; granite4.2:8b returns `line`
as a string; qwen2.5-coder:3b drops a record outright.

Summary length control is weak — only qwen3.5:2b, qwen2.5-coder:7b and
qwen3.5:4b stayed under 90 words. granite4.2:3b overran by 2x.

### `think:true`

Only 4 local tags accept the flag. `qwen2.5-coder:3b`, `qwen2.5-coder:7b` and
`phi4-mini:3.8b` return HTTP 400 `"<model>" does not support thinking`.

| Model | Extract | Fix | Summary | Wall: extract / fix / summary |
|---|---|---|---|---:|
| **granite4.2:3b** | **PASS** | **6/6** | **85 words PASS** | 21.4s / 63.4s / 53.8s |
| qwen3.5:4b | PASS | **6/6** | 84 words PASS | 42.9s / 92.7s / 109.2s |
| qwen3.5:2b | PASS | EMPTY (`done_reason:length`) | EMPTY (`length`) | 38.6s / 202.8s / 215.8s |

qwen3.5:4b's `eval_count` was 2,107 / 5,245 / 6,145 with thinking fields of
6,655 / 18,339 / 18,187 characters — comfortably inside the 16K budget. This
was the first `think:true` run in the series where any model finished
thinking *and* answered.

qwen3.5:2b burns the entire 16,384-token budget on reasoning for fix and
summary without ever emitting an answer — the same failure it showed at 512
through 4,096. Raising the budget further will not help. It does reliably
solve `extract`.

### `think:false` vs `think:true`, matched budgets (qwen3.5:4b)

| Task | false | true | Speedup | false result | true result |
|---|---:|---:|---:|---|---|
| Extract | 7.98s | 42.87s | 5.4x | PASS | PASS |
| Fix | 3.35s | 92.66s | 27.6x | **FAIL 4/6** | PASS 6/6 |
| Summary | 2.93s | 109.22s | 37.3x | PASS | PASS |

`think:false` is 5-37x faster and only loses on `fix`. That single loss is
the whole argument for keeping a `think:true` route.

### GPU, 16K

GTX 1660 Super, 6,144 MiB total, idle before each run (~480-525 MiB).

| Model | Peak VRAM (think:false) | Peak VRAM (think:true) |
|---|---:|---:|
| granite4.2:3b | 3,333 MiB | 3,722 MiB |
| qwen3.5:2b | 3,678 MiB | 3,909 MiB |
| phi4-mini:3.8b | 4,144 MiB | — |
| qwen3.5:4b | ~4,500 MiB | ~4,586 MiB |
| qwen2.5-coder:3b | 4,597 MiB | — |
| qwen2.5-coder:7b | 4,658 MiB | — |
| granite4.2:8b | 4,658 MiB | — |

No spillover at 16K for any model. `ollama ps` reported 100% GPU / no CPU
offload throughout. A 16K KV cache plus a 4B model fits 6 GB comfortably.

## 32K context / 512 output — the earlier series

Superseded by the 16K runs, kept because it's where the `think:false` fix and
the phi4-mini anomaly come from.

### `think:false`, first run and rerun

| Model | Extract (1st → rerun) | Fix (1st → rerun) | Summary words | Wall (rerun): E / C / S |
|---|---|---:|---:|---:|
| qwen3.5:4b | Pass → Pass | 4/6 → 3/6 | 73 | 10.62s / 3.44s / 2.96s |
| granite4.2:3b | Pass → Pass | 2/6 → 2/6 | 179 | 6.37s / 2.01s / 3.99s |
| qwen2.5-coder:3b | Fail → Fail | 3/6 → 4/6 | 100 (fenced) | 7.74s / 1.00s / 2.12s |
| qwen2.5-coder:1.5b | Fail → — | — | — | 5.81s / — / — |
| qwen3.5:0.8b | Fail → — | — | — | 5.55s / — / — |
| qwen3.5:2b | — → Fail | — → 3/6 | 88 | 8.13s / 2.48s / 1.88s |
| qwen2.5-coder:7b | — → Fail* | — → **5/6** | 86 (fenced) | 19.22s / 2.82s / 6.96s |
| granite4.2:8b | — → Fail* | — → 2/6 | 146 | 32.76s / 14.95s / 19.13s |
| phi4-mini:3.8b | — → Fail | — → **6/6** | 103 | 17.17s / 2.16s / 3.64s |
| gemma4:31b-cloud | Pass | **6/6** | 76 | 1.83s / 0.90s / 1.56s |
| nemotron-3-super:cloud | Pass | 4/6 | 100 | 1.87s / 1.65s / 3.99s |

\* Correct records and order, but `line` encoded as a JSON string.

**Run-to-run variance is real even at temperature 0 / seed 42** —
qwen2.5-coder:3b went 3/6 → 4/6 and qwen3.5:4b went 4/6 → 3/6 on identical
inputs. Treat any single-point difference under ~1 case as noise.

**phi4-mini's 6/6 did not reproduce.** At 16K/16K it scores 4/6 with the
standard Map-insertion-order bug. Same seed, same temperature — so this is
genuine budget sensitivity, not noise. Output budget, not model choice, is
the deciding factor for this task.

Gemma4-31B-cloud is the only model to pass `fix` 6/6 with `think:false`
anywhere in the series (it tracks last indexes and sorts on them).

### `think:true` at 512 output — total failure

| Model | think:false E / C / S | think:true E / C / S | Failure mode |
|---|---|---|---|
| qwen3.5:4b | Pass / 3/6 / 73 | Fail / 0/6 / — | thinking field ate all 512 tokens |
| qwen3.5:2b | Fail / 3/6 / 88 | Fail / 0/6 / — | same |
| gemma4:31b-cloud | Pass / 6/6 / 76 | Fail / 0/6 / — | same |
| granite4.2:3b | Pass / 2/6 / 179 | Fail / 0/6 / 364 | reasoning emitted inline in `response` |
| granite4.2:8b | Fail* / 2/6 / 146 | Fail / 0/6 / 383 | same |
| nemotron-3-super:cloud | Pass / 4/6 / 100 | Fail / **6/6** / — | only thinking code pass; other two lacked a final answer |

Context size does not fix this. Context is input/KV capacity; `num_predict`
is the completion budget, and thinking shares it with the final answer.

### Thinking-budget threshold sweep (32K ctx, `num_predict` 512 → 4096)

Smallest `num_predict` that produced a contract-valid result:

| Model | Extract | Code | Summary |
|---|---:|---:|---:|
| qwen3.5:4b | **2,048** (35.13s) | none by 4,096 | none by 4,096 |
| qwen3.5:2b | **4,096** (36.37s) | none by 4,096 | none by 4,096 |
| granite4.2:3b | none by 4,096 † | none by 4,096 † | none by 4,096 † |
| granite4.2:8b | none (61.5 / 105.2 / 166.1 / 167.0s) | none (52.8 / 106.2 / 225.8 / 300.8s) | sweep stopped |

† **Probably a grading error, not a model failure.** Granite emits reasoning
inline as `<think>…</think>answer` rather than in Ollama's separate
`thinking` field. The sweep graded the whole `response` field, so it scored
granite as "never reached a final output" when an answer may well have sat
after `</think>`. The 16K rerun, which strips to the last `</think>`, gets
6/6 from the same model. Not distinguishable from the retained data which it
was — re-grade before citing the sweep's granite rows.

The granite4.2:8b sweep was stopped by the user mid-run. Its partial rows are
not a valid comparison and must not guide routing.

### GPU residency at 32K

| Model | Allocated | VRAM | Residency |
|---|---:|---:|---|
| qwen2.5-coder:1.5b | 1.56 GiB | 1.56 | Full |
| qwen3.5:2b | 2.48 GiB | 2.48 | Full |
| qwen2.5-coder:3b | 2.60 GiB | 2.60 | Full |
| granite4.2:3b | 3.39 GiB | 3.39 | Full |
| qwen3.5:4b | 3.46 GiB | 3.46 | Full |
| phi4-mini:3.8b | 4.77 GiB | 3.97 | **Partial** |
| qwen2.5-coder:7b | 5.56 GiB | 3.92 | **Partial** |
| granite4.2:8b | 7.98 GiB | 3.99 | **Partial** |

Halving to 16K did not buy full residency for the 7B/8B models (5.05 and 6.49
GiB allocated). Anything above ~4B spills on this GPU regardless of context.

Model labels understate parameter counts — granite4.2:3b reports 3.7B,
qwen3.5:4b reports 4.7B. Read metadata, don't infer fit from the tag.

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
  qwen2.5-coder tags and phi4-mini.
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

## Related

- [benchmarks/agentic-delegation.md](benchmarks/agentic-delegation.md) — the
  worker-tool and cloud-harness runs (a different question: can a model drive
  a git task to completion).
- [benchmarks/early-trials-2026-09-12-13.md](benchmarks/early-trials-2026-09-12-13.md)
  — the pre-fixture single-prompt trials that found the `think:false` bug.
- [local-claude-worker-experiment-2026-09-14.md](local-claude-worker-experiment-2026-09-14.md)
  — full-harness experiment behind `run_local_worker_task`.
- [improvements-backlog.md](improvements-backlog.md) — proposed changes,
  including unresolved git-option-injection findings.
