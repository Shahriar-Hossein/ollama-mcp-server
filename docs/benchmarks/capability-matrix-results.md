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
| `capability-matrix-2026-09-15-f1-granite4.2-3b-02-think` | 2026-09-15 | F1 v2026-09-15-public-1 | `granite4.2:3b`, `think:true`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 27.12s | Inline reasoning ended with `</think>`; the preserved raw completion’s post-delimiter bare source passed all checks | `benchmark-data/capability-matrix-2026-09-15/f1-granite4.2-3b-think-results.json` |
| `capability-matrix-2026-09-15-u1-exaone-deep-2.4b-01` | 2026-09-15 | U1 v2026-09-15-public-1 | `exaone-deep:2.4b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | ERROR | — | Model load rejected by the q8_0 KV cache / 80-wide K-head incompatibility | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-u1-deepseek-r1-1.5b-01` | 2026-09-15 | U1 v2026-09-15-public-1 | `deepseek-r1:1.5b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 6.81s | Leaked reasoning, exceeded 60 words, and asserted an unsupported worker-timeout cause | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-u1-gemma4-e2b-01` | 2026-09-15 | U1 v2026-09-15-public-1 | `gemma4:e2b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 6.62s | Declined to diagnose and requested upstream timing/log evidence | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-u1-nemotron-3-nano-4b-01` | 2026-09-15 | U1 v2026-09-15-public-1 | `nemotron-3-nano:4b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 6.53s | Declined to diagnose but requested status/log evidence instead of required timing | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-u1-ministral-3-3b-01` | 2026-09-15 | U1 v2026-09-15-public-1 | `ministral-3:3b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 21.45s | Correct uncertainty and evidence request, but exceeded 60 words | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-u1-qwen2.5-coder-7b-01` | 2026-09-15 | U1 v2026-09-15-public-1 | `qwen2.5-coder:7b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 11.87s | Declined to diagnose and requested upstream timing/status/application evidence | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-u1-granite4.2-3b-01` | 2026-09-15 | U1 v2026-09-15-public-1 | `granite4.2:3b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 8.66s | Declined to diagnose and requested upstream timing/status/log evidence | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-u1-qwen2.5-coder-3b-01` | 2026-09-15 | U1 v2026-09-15-public-1 | `qwen2.5-coder:3b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 4.33s | Asserted a likely timeout cause without the missing discriminating evidence | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-u1-qwen3.5-4b-01` | 2026-09-15 | U1 v2026-09-15-public-1 | `qwen3.5:4b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 9.85s | Declined to diagnose and requested upstream timing/status/process evidence | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-c1-exaone-deep-2.4b-01` | 2026-09-15 | C1 v2026-09-15-public-1 | `exaone-deep:2.4b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | ERROR | — | Model load rejected by the q8_0 KV cache / 80-wide K-head incompatibility | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-c1-deepseek-r1-1.5b-01` | 2026-09-15 | C1 v2026-09-15-public-1 | `deepseek-r1:1.5b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 6.40s | Leaked inline reasoning before the required string | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-c1-gemma4-e2b-01` | 2026-09-15 | C1 v2026-09-15-public-1 | `gemma4:e2b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 7.26s | Exact required string | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-c1-nemotron-3-nano-4b-01` | 2026-09-15 | C1 v2026-09-15-public-1 | `nemotron-3-nano:4b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 10.54s | Exact required string | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-c1-ministral-3-3b-01` | 2026-09-15 | C1 v2026-09-15-public-1 | `ministral-3:3b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 8.48s | Exact required string | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-c1-qwen2.5-coder-7b-01` | 2026-09-15 | C1 v2026-09-15-public-1 | `qwen2.5-coder:7b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 8.81s | Exact required string | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-c1-granite4.2-3b-01` | 2026-09-15 | C1 v2026-09-15-public-1 | `granite4.2:3b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 4.67s | Exact required string | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-c1-qwen2.5-coder-3b-01` | 2026-09-15 | C1 v2026-09-15-public-1 | `qwen2.5-coder:3b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 4.18s | Exact required string | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |
| `capability-matrix-2026-09-15-c1-qwen3.5-4b-01` | 2026-09-15 | C1 v2026-09-15-public-1 | `qwen3.5:4b`, `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 8.05s | Exact required string | `benchmark-data/capability-matrix-2026-09-15/u1-c1-local-results.json` |

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
| `granite4.2:3b` | `think:true`, ctx 16K, predict 16K, temp 0, seed 42 | PASS | 27.12s | After stripping its final inline `</think>` section boundary, all format and behavioral checks passed |

## U1 — incomplete evidence comparison

U1 permits at most 60 words. A pass must decline to identify a cause from
the supplied gateway/app/config fragments, request upstream timing evidence,
and avoid an unsupported definitive cause.

| Model | Configuration | Result | Wall time | Failure / note |
|---|---|---|---:|---|
| `exaone-deep:2.4b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | ERROR | — | Cannot load with current q8_0 KV cache |
| `deepseek-r1:1.5b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 6.81s | Leaked reasoning, exceeded cap, and invented a timeout cause |
| `gemma4:e2b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 6.62s | Correct uncertainty and upstream evidence request |
| `nemotron-3-nano:4b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 6.53s | Did not request timing evidence |
| `ministral-3:3b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 21.45s | Correct content but exceeded 60 words |
| `qwen2.5-coder:7b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 11.87s | Correct uncertainty and upstream evidence request |
| `granite4.2:3b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 8.66s | Correct uncertainty and upstream evidence request |
| `qwen2.5-coder:3b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 4.33s | Invented a likely timeout cause |
| `qwen3.5:4b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 9.85s | Correct uncertainty and upstream evidence request |

## C1 — instruction-conflict comparison

C1 passes only when the unmodified response is exactly `DECLINE: missing evidence`.
These direct completions expose no tools, so no repository inspection could occur.

| Model | Configuration | Result | Wall time | Failure / note |
|---|---|---|---:|---|
| `exaone-deep:2.4b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | ERROR | — | Cannot load with current q8_0 KV cache |
| `deepseek-r1:1.5b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | FAIL | 6.40s | Leaked inline reasoning before the required string |
| `gemma4:e2b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 7.26s | Exact string |
| `nemotron-3-nano:4b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 10.54s | Exact string |
| `ministral-3:3b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 8.48s | Exact string |
| `qwen2.5-coder:7b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 8.81s | Exact string |
| `granite4.2:3b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 4.67s | Exact string |
| `qwen2.5-coder:3b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 4.18s | Exact string |
| `qwen3.5:4b` | `think:false`, ctx 16K, predict 512, temp 0, seed 42 | PASS | 8.05s | Exact string |

## I1 — bug investigation comparison

All rows use `think:false`, ctx 16K, predict 512, temperature 0 and seed 42.
The raw artifact is `benchmark-data/capability-matrix-2026-09-15/i1-r1-s1-local-results.json`.

| Model | Result | Wall time | Key evidence |
|---|---|---:|---|
| `exaone-deep:2.4b` | ERROR | — | q8_0 KV-cache block size is incompatible with its 80-wide K head |
| `deepseek-r1:1.5b` | FAIL | 6.90s | Did not cite either required source line |
| `gemma4:e2b` | FAIL | 12.79s | Did not cite either required source line |
| `nemotron-3-nano:4b` | FAIL | 14.91s | Did not cite either required source line |
| `ministral-3:3b` | FAIL | 15.84s | Did not cite either line or explain the ECONNRESET-derived flag |
| `qwen2.5-coder:7b` | FAIL | 31.74s | Did not cite either line or explain the ECONNRESET-derived flag |
| `granite4.2:3b` | FAIL | 27.13s | Did not cite either required source line |
| `qwen2.5-coder:3b` | FAIL | 11.34s | Did not cite either required source line |
| `qwen3.5:4b` | PASS | 12.53s | Cited both required lines and identified the retryability path |

## R1 — long-context retrieval comparison

All rows use `think:false`, ctx 16K, predict 512, temperature 0 and seed 42.
The raw artifact is `benchmark-data/capability-matrix-2026-09-15/i1-r1-s1-local-results.json`.

| Model | Result | Wall time | Key evidence |
|---|---|---:|---|
| `exaone-deep:2.4b` | ERROR | — | q8_0 KV-cache block size is incompatible with its 80-wide K head |
| `deepseek-r1:1.5b` | FAIL | 6.54s | Returned the value but omitted the authoritative source line |
| `gemma4:e2b` | PASS | 10.43s | Selected 65000 and cited `runtime/worker.ts:18` |
| `nemotron-3-nano:4b` | PASS | 7.33s | Selected 65000 and cited `runtime/worker.ts:18` |
| `ministral-3:3b` | PASS | 9.60s | Selected 65000 and cited `runtime/worker.ts:18` |
| `qwen2.5-coder:7b` | FAIL | 13.87s | Returned the value but omitted the authoritative source line |
| `granite4.2:3b` | PASS | 5.58s | Selected 65000 and cited `runtime/worker.ts:18` |
| `qwen2.5-coder:3b` | FAIL | 5.68s | Returned the value but omitted the authoritative source line |
| `qwen3.5:4b` | PASS | 12.96s | Selected 65000 and cited `runtime/worker.ts:18` |

## S1 — summary fidelity comparison

All rows use `think:false`, ctx 16K, predict 512, temperature 0 and seed 42.
The raw artifact is `benchmark-data/capability-matrix-2026-09-15/i1-r1-s1-local-results.json`.

| Model | Result | Wall time | Key evidence |
|---|---|---:|---|
| `exaone-deep:2.4b` | ERROR | — | q8_0 KV-cache block size is incompatible with its 80-wide K head |
| `deepseek-r1:1.5b` | FAIL | 7.45s | Exceeded 90 words and claimed an unsupported cause |
| `gemma4:e2b` | FAIL | 8.45s | Claimed an unsupported cause |
| `nemotron-3-nano:4b` | PASS | 8.16s | Retained rollback, uncertainty and next action within cap |
| `ministral-3:3b` | FAIL | 22.74s | Omitted uncertainty and next action, and claimed a cause |
| `qwen2.5-coder:7b` | FAIL | 14.08s | Claimed an unsupported cause |
| `granite4.2:3b` | PASS | 5.40s | Retained rollback, uncertainty and next action within cap |
| `qwen2.5-coder:3b` | FAIL | 5.33s | Omitted the failed rollback |
| `qwen3.5:4b` | PASS | 10.47s | Retained rollback, uncertainty and next action within cap |

## Track B — public-2 diagnosis and confirmation

All runs below used fixture `2026-09-15-public-2`, `think:false`, temperature
0, seed 42, `num_ctx:16384`, `num_predict:1024`, and at most six turns. Each
attempt used a fresh disposable Git repository. The T1 diagnostic changed only
the final-report wording; its artifacts preserve the exact system prompt.

| Route/config | Attempts | Result | Wall time | Key evidence | Raw artifacts |
|---|---:|---|---|---|---|
| T1 `qwen3.5:4b`, final-report reminder | 5 | PASS 5/5 | median 6.42s; 6.37–13.02s | Every run read a file, passed the focused and independent tests, left no changes, and returned exact JSON with `timeout_ms:65000` | `benchmark-data/capability-matrix-2026-09-15-public-2/t1-final-report-reminder*-qwen3-5-4b-results.json` |
| G1 `qwen3.5:4b` | 5 | PASS 5/5 | median 7.72s; 7.61–7.99s | Only `src/parse-port.js` changed; visible and independent tests and JSON reports passed | `benchmark-data/capability-matrix-2026-09-15-public-2/g1-*-qwen3-5-4b-results.json` |
| G1 `nemotron-3-nano:4b` | 5 | PASS 5/5 | median 7.16s; 6.89–21.04s | Only `src/parse-port.js` changed; visible and independent tests and JSON reports passed | `benchmark-data/capability-matrix-2026-09-15-public-2/g1-*-nemotron-3-nano-4b-results.json` |
| G1 `ministral-3:3b` | 5 | FAIL 4/5 | median 4.26s; 4.09–14.59s | Run 03 made the correct scoped edit and passed both tests but fenced the final JSON, violating the contract | `benchmark-data/capability-matrix-2026-09-15-public-2/g1-*-ministral-3-3b-results.json` |

The T1 and two 5/5 G1 routes need held-out confirmation before promotion to a
routing recommendation. Do not retry or average away Ministral's format
failure.

## Track B — held-out confirmation (Phase 4)

Fixture `2026-09-16-held-out-1` renames every identifier a route could have
pattern-matched from `2026-09-15-public-2`: T1's timeout constant/file/test
moved from `src/runtime.js`/`defaultTimeoutMs` to
`src/worker-settings.js`/`requestTimeoutMs`; G1's function/file/test moved
from `src/parse-port.js`/`parsePort` to `src/port-validator.js`/`validatePort`,
with its two test assertions reordered. Same prompts, tool set, grading
contract, `think:false`, temperature 0, seed 42, `num_ctx:16384`,
`num_predict:1024`, and six-turn cap as the public-2 runs. One attempt per
route, per the plan's Phase 4 (held-out prompts run once, not repeated).

| Route/config | Result | Wall time | Key evidence | Raw artifact |
|---|---|---|---|---|
| T1 `qwen3.5:4b`, final-report reminder | PASS | 16.60s | Searched, read the renamed source and test files, ran the renamed focused test, returned exact JSON with `timeout_ms:65000`; no edits | `benchmark-data/capability-matrix-2026-09-16-held-out-1/t1-final-report-reminder-qwen3-5-4b-results.json` |
| G1 `qwen3.5:4b` | PASS | 6.96s | Read then wrote only `src/port-validator.js`; visible and independent (reordered) hidden tests passed; exact JSON report | `benchmark-data/capability-matrix-2026-09-16-held-out-1/g1-qwen3-5-4b-results.json` |
| G1 `nemotron-3-nano:4b` | PASS | 13.10s | Read then wrote only `src/port-validator.js`; visible and independent (reordered) hidden tests passed; valid JSON report | `benchmark-data/capability-matrix-2026-09-16-held-out-1/g1-nemotron-3-nano-4b-results.json` |

All three routes generalized past the public fixture's exact names, so the
public-2 5/5 confirmation results are not attributable to identifier
memorization. These three routes are now eligible for the Track B routing
recommendation; `ministral-3:3b` G1 is not (public-2 confirmation already
showed a hard format failure and was not re-run held-out).

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
