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
