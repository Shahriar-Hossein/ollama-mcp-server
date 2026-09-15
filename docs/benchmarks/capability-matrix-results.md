# Capability-matrix results

This is the reviewable, append-only comparison tracker for the
[capability-matrix plan](capability-matrix-plan.md). Add one row per model,
configuration and fixture attempt. Keep raw requests and responses in the
gitignored `benchmark-data/capability-matrix-YYYY-MM-DD/` directory, and put
only the outcome and decision-relevant evidence here.

These are one-run capability-screen results, not reliability estimates.
`—` means not yet run; `ON HOLD` means deliberately not run.

## Run register

| Run ID | Date | Fixture | Model/config | Result | Wall time | Key evidence | Raw artifact |
|---|---|---|---|---|---:|---|---|
| `capability-matrix-2026-09-15-e1-exaone-deep-2.4b-01` | 2026-09-15 | E1 v2026-09-15-public-1 | `exaone-deep:2.4b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | ERROR | — | Model load rejected: q8_0 KV cache block size is incompatible with its 80-wide K head | `benchmark-data/capability-matrix-2026-09-15/e1-local-results.json` |
| `capability-matrix-2026-09-15-e1-exaone-deep-2.4b-02-f16` | 2026-09-15 | E1 v2026-09-15-public-1 | `exaone-deep:2.4b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42; isolated `f16` KV cache | FAIL | 12.91s | Loaded successfully but emitted `<thought>` text until the 1,024-token limit; no JSON answer | `benchmark-data/capability-matrix-2026-09-15/e1-exaone-deep-2.4b-f16.json` |
| `capability-matrix-2026-09-15-e1-deepseek-r1-1.5b-01` | 2026-09-15 | E1 v2026-09-15-public-1 | `deepseek-r1:1.5b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 8.12s | Leaked reasoning; returned closed ticket and forbidden fields | `benchmark-data/capability-matrix-2026-09-15/e1-local-results.json` |
| `capability-matrix-2026-09-15-e1-gemma4-e2b-01` | 2026-09-15 | E1 v2026-09-15-public-1 | `gemma4:e2b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 6.81s | Correct data, but wrapped it in a Markdown code fence | `benchmark-data/capability-matrix-2026-09-15/e1-local-results.json` |
| `capability-matrix-2026-09-15-e1-nemotron-3-nano-4b-01` | 2026-09-15 | E1 v2026-09-15-public-1 | `nemotron-3-nano:4b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | PASS | 6.66s | Exact two-item JSON; all decoys excluded | `benchmark-data/capability-matrix-2026-09-15/e1-local-results.json` |
| `capability-matrix-2026-09-15-e1-ministral-3-3b-01` | 2026-09-15 | E1 v2026-09-15-public-1 | `ministral-3:3b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 10.53s | Correct data, but wrapped it in a Markdown code fence | `benchmark-data/capability-matrix-2026-09-15/e1-local-results.json` |
| `capability-matrix-2026-09-15-e1-qwen2.5-coder-7b-01` | 2026-09-15 | E1 v2026-09-15-public-1 | `qwen2.5-coder:7b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 8.51s | Correct data, but wrapped it in a Markdown code fence | `benchmark-data/capability-matrix-2026-09-15/e1-local-results.json` |
| `capability-matrix-2026-09-15-e1-granite4.2-3b-01` | 2026-09-15 | E1 v2026-09-15-public-1 | `granite4.2:3b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | PASS | 4.17s | Exact two-item JSON; all decoys excluded | `benchmark-data/capability-matrix-2026-09-15/e1-local-results.json` |
| `capability-matrix-2026-09-15-e1-qwen2.5-coder-3b-01` | 2026-09-15 | E1 v2026-09-15-public-1 | `qwen2.5-coder:3b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 4.13s | Correct data, but wrapped it in a Markdown code fence | `benchmark-data/capability-matrix-2026-09-15/e1-local-results.json` |
| `capability-matrix-2026-09-15-e1-qwen3.5-4b-01` | 2026-09-15 | E1 v2026-09-15-public-1 | `qwen3.5:4b`, `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | PASS | 8.18s | Exact two-item JSON; excluded the quoted and in-message decoys and closed ticket | `benchmark-data/capability-matrix-2026-09-15/e1-qwen3.5-4b.json` |
| `capability-matrix-2026-09-15-f1-exaone-deep-2.4b-01` | 2026-09-15 | F1 v2026-09-15-public-1 | `exaone-deep:2.4b`, `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | ERROR | — | Model load rejected: q8_0 KV cache block size is incompatible with its 80-wide K head | `benchmark-data/capability-matrix-2026-09-15/f1-local-results.json` |
| `capability-matrix-2026-09-15-f1-deepseek-r1-1.5b-01` | 2026-09-15 | F1 v2026-09-15-public-1 | `deepseek-r1:1.5b`, `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | FAIL | 8.70s | Inline reasoning made the submitted source syntactically invalid | `benchmark-data/capability-matrix-2026-09-15/f1-local-results.json` |
| `capability-matrix-2026-09-15-f1-gemma4-e2b-01` | 2026-09-15 | F1 v2026-09-15-public-1 | `gemma4:e2b`, `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | FAIL | 8.07s | Object-based grouping breaks the `__proto__` key (`groups[kind].push` is not a function) | `benchmark-data/capability-matrix-2026-09-15/f1-local-results.json` |
| `capability-matrix-2026-09-15-f1-nemotron-3-nano-4b-01` | 2026-09-15 | F1 v2026-09-15-public-1 | `nemotron-3-nano:4b`, `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 8.48s | Returned bare source; Map order, `__proto__`, immutability and TypeError checks all passed | `benchmark-data/capability-matrix-2026-09-15/f1-local-results.json` |
| `capability-matrix-2026-09-15-f1-ministral-3-3b-01` | 2026-09-15 | F1 v2026-09-15-public-1 | `ministral-3:3b`, `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 10.66s | Returned bare source; Map order, `__proto__`, immutability and TypeError checks all passed | `benchmark-data/capability-matrix-2026-09-15/f1-local-results.json` |
| `capability-matrix-2026-09-15-f1-qwen2.5-coder-7b-01` | 2026-09-15 | F1 v2026-09-15-public-1 | `qwen2.5-coder:7b`, `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 13.49s | Returned bare source; Map order, `__proto__`, immutability and TypeError checks all passed | `benchmark-data/capability-matrix-2026-09-15/f1-local-results.json` |
| `capability-matrix-2026-09-15-f1-granite4.2-3b-01` | 2026-09-15 | F1 v2026-09-15-public-1 | `granite4.2:3b`, `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | FAIL | 4.17s | Returned a null-prototype object instead of the required Map | `benchmark-data/capability-matrix-2026-09-15/f1-local-results.json` |
| `capability-matrix-2026-09-15-f1-qwen2.5-coder-3b-01` | 2026-09-15 | F1 v2026-09-15-public-1 | `qwen2.5-coder:3b`, `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | FAIL | 8.42s | Formatted as bare source but generated invalid `Map` construction | `benchmark-data/capability-matrix-2026-09-15/f1-local-results.json` |
| `capability-matrix-2026-09-15-f1-qwen3.5-4b-01` | 2026-09-15 | F1 v2026-09-15-public-1 | `qwen3.5:4b`, `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 14.45s | Returned bare source; Map order, `__proto__`, immutability and TypeError checks all passed | `benchmark-data/capability-matrix-2026-09-15/f1-local-results.json` |

E1 expected output:

```json
[{"id":"INC-104","owner":"payments","severity":"high"},{"id":"INC-106","owner":"infra","severity":"critical"}]
```

## E1 — strict extraction comparison

| Model | Configuration | Result | Wall time | Failure / note |
|---|---|---|---:|---|
| `exaone-deep:2.4b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | ERROR | — | Cannot load with current q8_0 KV cache: block size 32 does not divide its K-head width 80 |
| `exaone-deep:2.4b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42; isolated `f16` KV cache | FAIL | 12.91s | Loads with f16 but exhausts its output budget in leaked `<thought>` text; returns no JSON |
| `deepseek-r1:1.5b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 8.12s | Leaked `<think>` content; returned the closed ticket and `status`/`message` fields |
| `gemma4:e2b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 6.81s | Content correct; JSON-only contract failed due to Markdown fence |
| `nemotron-3-nano:4b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | PASS | 6.66s | Exact JSON and correct exclusion of all three decoy forms |
| `ministral-3:3b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 10.53s | Content correct; JSON-only contract failed due to Markdown fence |
| `qwen2.5-coder:7b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 8.51s | Content correct; JSON-only contract failed due to Markdown fence |
| `granite4.2:3b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | PASS | 4.17s | Exact JSON and correct exclusion of all three decoy forms |
| `qwen2.5-coder:3b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | FAIL | 4.13s | Content correct; JSON-only contract failed due to Markdown fence |
| `qwen3.5:4b` | `think:false`, ctx 16K, predict 1024, temp 0, seed 42 | PASS | 8.18s | Exact JSON and correct exclusion of all three decoy forms |
| `gemma4:31b-cloud` | — | ON HOLD | — | Awaiting cloud-route, cost/privacy and budget decision |
| `nemotron-3-super:cloud` | — | ON HOLD | — | Awaiting cloud-route, cost/privacy and budget decision |

## F1 — spec-sensitive `groupBy` comparison

F1 requires bare JavaScript declaring `groupBy(rows)`. Its deterministic
grader requires a `Map`, first-seen Map-key and row order (including `"10"`
before `"2"`), safe `"__proto__"` handling, no input mutation and a
`TypeError` for a non-array argument. The raw model source was evaluated only
inside a Bubblewrap sandbox with no network or project files mounted.

| Model | Configuration | Result | Wall time | Failure / note |
|---|---|---|---:|---|
| `exaone-deep:2.4b` | `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | ERROR | — | Cannot load with current q8_0 KV cache: block size 32 does not divide its K-head width 80 |
| `deepseek-r1:1.5b` | `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | FAIL | 8.70s | Inline reasoning causes a syntax error |
| `gemma4:e2b` | `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | FAIL | 8.07s | `__proto__` is not a safe ordinary key |
| `nemotron-3-nano:4b` | `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 8.48s | All format and behavioral checks passed |
| `ministral-3:3b` | `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 10.66s | All format and behavioral checks passed |
| `qwen2.5-coder:7b` | `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 13.49s | All format and behavioral checks passed |
| `granite4.2:3b` | `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | FAIL | 4.17s | Returned an object, not the required Map |
| `qwen2.5-coder:3b` | `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | FAIL | 8.42s | Invalid `Map` construction |
| `qwen3.5:4b` | `think:false`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 14.45s | All format and behavioral checks passed |

## f16 KV-cache follow-up

Rerun the already-completed model/configuration pairs on the isolated `f16`
KV-cache server and record each as a separate comparison row. `f16` preserves
KV-cache precision, which may help long-context or lengthy-reasoning tasks,
but it does not change model weights or retroactively improve completed runs.
Use the same fixture and generation settings, and assess any accuracy change
alongside its VRAM, latency, and residency cost. For the short E1 failures
caused by Markdown fences or leaked reasoning, do not expect `f16` alone to
make a pass; only controlled reruns can establish an effect.

The isolated `f16` Ollama-server configuration is already prepared and was
used for `exaone-deep:2.4b` above. Keep its results separate from the normal
service, which remains on `q8_0`; the temporary `f16` server was stopped after
the E1 run.

## Comparison rules

- Compare only rows with the same fixture version and generation settings.
- A `PASS` requires both contract validity and correct content; do not score
  markdown-wrapped JSON as a pass.
- Keep cloud models `ON HOLD` until explicitly approved for evaluation.
- Promote a row to a routing recommendation only after the plan's repeated
  and held-out confirmation runs.
