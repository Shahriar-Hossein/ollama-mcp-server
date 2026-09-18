# benchmarks/

Model and config measurements. Start with **MASTER.md** for the current
recommendation; open a `runs/` file only when you need the reasoning or raw
numbers behind one specific series.

## Contents

| File | What it is |
|---|---|
| [MASTER.md](MASTER.md) | Current routing recommendation, winners/losers, hardware, traps. Read this first. |
| [model-classification.md](model-classification.md) | Models grouped by what they're good at (extraction, code fix, tool use, agentic driving), synthesized from MASTER.md + `runs/` |
| `runs/` | Individual benchmark runs, one file per question asked — see below |

### `runs/` — chronological, one file per question

| File | What it answers |
|---|---|
| [2026-09-12-early-trials.md](runs/2026-09-12-early-trials.md) | Pre-fixture single-prompt trials. Superseded but load-bearing for the `think:false` history |
| [2026-09-14-32k-context.md](runs/2026-09-14-32k-context.md) | Earlier 32K context / 512 output series, incl. thinking-budget threshold sweep |
| [2026-09-14-agentic-delegation.md](runs/2026-09-14-agentic-delegation.md) | Can a model drive a git task to completion end-to-end (not: is its output correct) |
| [2026-09-15-new-models.md](runs/2026-09-15-new-models.md) | `think:false`/`think:true` screen of newly-pulled models at 16K/16K |
| [2026-09-15-16k-context.md](runs/2026-09-15-16k-context.md) | Current series: 16K context / 16K output, `think:false` vs `think:true`, GPU residency |
| [2026-09-15-8k-context-coder.md](runs/2026-09-15-8k-context-coder.md) | `qwen2.5-coder:7b` only, 8K context / 16K output |
| [2026-09-15-capability-matrix-plan.md](runs/2026-09-15-capability-matrix-plan.md) | Planned fixtures and measurement rules for task-specific model routing |
| [2026-09-16-capability-matrix-results.md](runs/2026-09-16-capability-matrix-results.md) | Measured results for the plan above, by task (extraction, groupBy, evidence-boundary, conflict, bug-investigation, retrieval, summary) |
| [2026-09-16-local-explorer.md](runs/2026-09-16-local-explorer.md) | Can a local model absorb repo-discovery tool calls ahead of Haiku/Sonnet (not: is its single-completion output correct) |

## The rule for benchmark work

**Numbers stay in git. Generated artifacts do not.**

When you finish a benchmark run, split its output two ways:

| Goes in git (`docs/benchmarks/`) | Goes in `benchmark-data/` (gitignored) |
|---|---|
| The results table — model, config, pass/fail, wall time | `*_response.json`, `*_req.json` — raw Ollama API payloads |
| Which specific cases failed and why | `results.jsonl`, `followup.jsonl` — per-request logs |
| The decision the numbers support | `*_vram.log`, `*-ps.json` — nvidia-smi and residency samples |
| Reproduction details: prompts, seed, `num_ctx`, `num_predict` | `environment.json`, `*-metadata.json` — digests, runtime snapshots |
| Traps that cost you time | `grade.mjs`, `gen_requests.py`, `run_all.sh` — one-off scripts |
| | `grades.json`, `run_log.txt` — grader output |

If you can restate it as a row in a table, it belongs in git. If it's a file
a script wrote, it doesn't.

## Where new results go

**Add results to [MASTER.md](MASTER.md) as table rows.** Do not create a new
directory or top-level doc per run. That's what produced the mess this
structure replaced: ten `worker-review-*` directories, 2.6 MB, one
`benchmark.md` each saying roughly the same thing, with the actual conclusion
split across all of them.

A new file under `runs/` is justified only when the run answers a *different
question* — not when it's another pass at the same fixture. Another pass at
the extract/fix/summary fixture is a row in MASTER.md, not a new file.

If MASTER.md and a `runs/` file end up saying the same thing in different
words, that's drift — collapse it: keep the full data in the `runs/` file,
and make MASTER.md a short pointer to it.

## Keeping raw data

`benchmark-data/` is gitignored, so it's yours alone — nothing there survives
a clone. Keep it if you might re-grade (granite4.2:3b's inline `</think>`
format already caused one mis-grade that needed the raw responses to catch).
Delete it freely once the numbers are in MASTER.md; nothing in the repo
depends on it.
