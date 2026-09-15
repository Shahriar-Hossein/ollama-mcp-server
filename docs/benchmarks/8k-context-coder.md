# 8K context / 16K output — qwen2.5-coder:7b only

Requested because `think:true` isn't an option for this tag (see Traps in the
master doc) — this checks whether a smaller context budget changes anything
for the `think:false`-only coder model. Same [fixture](../BENCHMARKS.md#the-fixture),
`temperature 0`, `seed 42`, `keep_alive:2m`, cold start (nothing resident
before the run).

| Extract | Fix | Summary (words) | Wall: extract / fix / summary | Peak VRAM |
|---|---:|---|---:|---:|
| PASS | 5/6 (distinct-order F) | 82 words, **rollback-failure caveat missing → FAIL** | 14.38s / 2.17s / 4.73s | 4,619 MiB |

Generation speed: ~29 tok/s output, ~120-155 tok/s prompt processing, all
three tasks. Extract's 14.38s wall time is mostly model load (8.64s cold
start, not resident from a prior run) — fix and summary ran warm and finished
in 2-5s.

Same as the 16K run on this model (PASS / 5/6 / 86 words) except the summary:
at 16K it stayed under 90 words *and* kept the rollback-failure caveat; at 8K
it's shorter (82 words) but drops the caveat, which is the one thing the task
explicitly said to preserve. One data point — could be seed-sensitivity to
the shorter context window rather than a real 8K-vs-16K effect. Peak VRAM is
identical to the 16K run (4,658 MiB then vs 4,619 MiB now) — this model was
never context-bound on VRAM in the first place, so shrinking `num_ctx` bought
nothing here.

Fix output was still markdown-fenced, same as every other run of this model —
confirms it isn't a context-size artifact.
