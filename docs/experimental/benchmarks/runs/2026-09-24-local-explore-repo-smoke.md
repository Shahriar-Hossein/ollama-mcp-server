# Deterministic-first local scout smoke check — 2026-09-24

This is a small manual smoke check, not a reliability benchmark. The working tree
contained the new `local_explore_repo` code. The route used `qwen3.5:4b`, basic
retrieval with limit 10, at most six source files, `num_ctx=16384`,
`num_predict=2000`, `think=false`, and one retry for invalid evidence. It returned
model-selected candidate IDs and exact quotes checked against supplied lines.
The parent checked whether the selected candidate excerpts contained enough
source to answer the question; the server did not verify semantic conclusions.

## Exact final-route queries

The [query fixture](2026-09-24-local-explore-repo-queries.json) is the input for
future model comparisons. Pass each `query` string as the route's `query`
argument, in this order; IDs and development labels are for recording results.

1. **SE-01:** `Where is local_explorer_task registered, and is it enabled by default?`
2. **SE-02:** `Which environment variables gate the autonomous tools, and which tool does each gate?`
3. **EMBED-01:** `Where is Ollama embedding keep_alive set, and why is it zero?`
4. **QR-LOCK-01:** `How does Quality Review prevent duplicate concurrent workers?`

| Question | Result | Observation |
| --- | --- | --- |
| SE-01: registration and default | Useful | Selected `src/index.ts` and `src/config/features.ts`; their excerpts show the registration guard and default-off master flag. |
| SE-02: autonomous tool gates | Useful, with noise | Selected the worker registration block and both environment mappings; also selected unrelated verification candidates. |
| Embedding `keep_alive` location and reason | Useful | Selected `src/ollama-client.ts`, including the `keep_alive: "0"` call and GPU-memory explanation. |
| Quality Review concurrent workers | Miss | Selected review queue SQL instead of the SQLite worker lock. Luna fallback located `Store.lock()` in `src/quality-review/storage.ts`. |

With "useful" meaning the selected excerpts contain the answer evidence, the
final route was **3 useful / 1 miss** on these four questions. SE-01 and SE-02
were used while developing the candidate selection; the two other questions
were not. This is insufficient to estimate general reliability or parent-effort
savings. A missing or misleading selection must fall back to the parent agent.

Across all ten Qwen exploration calls made during this change, including the
legacy loop and intermediate route versions, manual assessment was **3 useful,
3 complete misses, 4 partial or incorrect**. The initial command that failed
before invoking Ollama is excluded. These development calls are not independent
trials and should not be compared as a model score. Luna supplied the needed
source evidence on four fallback explorations.

## Development-call query history

The ten Qwen calls above used five distinct query strings. The final four calls
used the four queries in the fixture. Earlier calls used:

| Exact query | Calls | Route |
| --- | ---: | --- |
| `Find the exact exported API and call path for deterministic basic hybrid retrieval in this repo. Identify how callers set the top-N limit and where result evidence ranges come from. Cite source file:line after reading the relevant lines. Do not answer from memory.` | 1 | Legacy `local_explorer_task` loop |
| SE-01 query above | 4 additional calls | Intermediate `local_explore_repo` versions |
| SE-02 query above | 1 additional call | Intermediate `local_explore_repo` version |

Thus SE-01 was asked five times total, SE-02 twice, and each other query once.
The earlier versions changed candidate selection and output contracts between
calls; their scores are development observations, not comparable model trials.

## Repeat protocol for another model

1. Freeze one repository snapshot and run every model against that same tree.
   The original Qwen run used HEAD `e59c427c57d9789634a584a4bd19471662f6a9fd`
   plus uncommitted changes, including the new tool. `indexRepository` indexes
   tracked files, so committing those files can change the candidate corpus.
   Rerun Qwen on the frozen snapshot before comparing it with challengers.
2. Call `runLocalExploreRepo` with the four fixture queries, `limit=10`, and
   change only `model`. The route fixes basic retrieval, the six-file cap, 16K
   context, 2K output, `think=false`, and one invalid-evidence retry. MCP use
   requires `ENABLE_LOCAL_EXPLORER_TASK=1`; direct function calls do not.
3. Save the full structured result for each question: selected candidates,
   checked quotes, `status`, `model_calls`, and unresolved items. Also record
   model tag/digest, source-tree identity, Ollama version, elapsed time, and
   whether the model was cold or resident. Run local models serially.
4. Grade the selected excerpts against the question, not the model's confidence.
   "Useful" means they contain enough source to answer; "partial" means only
   some required evidence; "miss" means no usable answer evidence. Check the
   source directly. Do not put expected answers into the model prompt.

Grader-only source targets for this tree: SE-01 needs the registration guard in
`src/index.ts` and default/override behavior in `src/config/features.ts`; SE-02
needs the two worker mappings in those files; EMBED-01 needs the setting and
GPU-memory reason in `src/ollama-client.ts`; QR-LOCK-01 needs the SQLite
`worker_lock` in `src/quality-review/storage.ts` and its use in `service.ts`.
These are leads for human grading, not exact-string pass conditions.

## Nine-model comparison — 2026-09-24

All models ran serially on commit `3c94ae1b8a3829ab22d0a367ad06f838b24c3697`
with the fixture above, `limit=10`, and the fixed route controls stated in the
repeat protocol. Ollama was `0.34.3`. Raw structured outputs are retained in
the ignored artifact `benchmark-data/local-explore-repo-smoke-2026-09-24/model-comparison.json`.
The model digests at the time of the run were: CodeScout `4d6e5af47692`, Spark
Coder `6810c00133dc`, Qwen 0.8B `f3817196d142`, Qwen 2B `324d162be6ca`, Qwen
4B `2a654d98e6fb`, Granite 4.1 `6fd349357287`, Granite 4.2 `40577dc168a3`,
Ministral `f04aa1c738f6`, and Qwen2.5 Coder 3B `f72c60cabf62`.

Human grading assessed whether a model-selected candidate excerpt contained
enough source to answer the question. `Useful`/`partial`/`miss` therefore
measure semantic source selection; `accepted` counts outputs that also passed
the route's exact-quote validator. A failed validator is not a semantic pass
for unattended use, even when its selected candidate happens to be useful.

| Model | Semantic selections (SE-01 / SE-02 / EMBED / QR lock) | Useful / partial / miss | Accepted | Total elapsed |
| --- | --- | ---: | ---: | ---: |
| `code-scout:4b` | useful / partial / useful* / miss | 2 / 1 / 1 | 3 / 4 | 74.7s |
| `spark-coder:4b` | useful / partial / useful / miss | 2 / 1 / 1 | 3 / 4 | 92.9s |
| `qwen3.5:0.8b` | miss / miss / miss / miss | 0 / 0 / 4 | 0 / 4 | 59.5s |
| `qwen3.5:2b` | miss / miss / useful / miss | 1 / 0 / 3 | 1 / 4 | 58.5s |
| `qwen3.5:4b` | useful / partial / useful / miss | 2 / 1 / 1 | 4 / 4 | 91.8s |
| `granite4.1:3b` | useful* / partial* / useful* / miss | 2 / 1 / 1 | 0 / 4 | 107.2s |
| `granite4.2:3b` | miss / miss / miss / miss | 0 / 0 / 4 | 1 / 4 | 76.7s |
| `ministral-3:3b` | useful / useful / useful* / miss | 3 / 0 / 1 | 3 / 4 | 73.2s |
| `qwen2.5-coder:3b` | partial / partial / miss / miss | 0 / 2 / 2 | 3 / 4 | 62.7s |

`*` means the model selected a source-bearing candidate but failed exact-quote
validation after its retry; it remains unsuitable for an unattended result.
For `qwen3.5:4b`, all quotes validated, but SE-02 omitted the config lines that
name the two environment variables and QR-LOCK-01 selected queue/status code
instead of `worker_lock` in storage. Those are semantic selection failures,
not validator failures.

Ministral 3B is the best semantic-selection challenger here (3/4) and is
faster than Qwen 4B, but its embedding answer was rejected for invalid quotes.
Qwen 4B remains the safer current default: it was the only model with four
validator-accepted outputs, though its semantic result was only 2 useful, 1
partial, and 1 miss. This four-question smoke check is too small and shares a
retrieval miss on the worker-lock question, so it does not justify changing the
default. A next comparison should add held-out questions and repeat the two
leaders with cold/warm runs before routing changes.
