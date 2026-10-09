# Fresh language evaluation fixture — 2026-10-09

The frozen fixture contains twelve source questions: PHP 4, Python 4, Go 2 and
Rust 2. Its ten source files live under
`scripts/experimental/fixtures/language-eval/source/`; the answer manifest is
kept separately in `2026-10-09-language-eval.json`. Evaluation runners must
copy only that source directory into a temporary target repository. Never put
the manifest or its answers in the retrieval root or model prompt.

The sources cover PHP namespace aliases, `__DIR__` include syntax, paired
configuration keys and guarded calls; Python package-relative imports, aliases,
local shadowing, dictionaries and async functions; Go receiver methods; Rust
`impl` lexical context and receiver-call spelling; and Unicode distractors.
Go and Rust questions ask for source declarations and call expressions only.
The repository index does not establish general receiver or method dispatch.
The fixture does not claim language runtime tests.

`node --import tsx scripts/experimental/language-eval-fixture.ts` checks the
source-only file set and SHA-256 hashes, exact complete required lines, unique
IDs and the 4/4/2/2 language distribution. Answers and forbidden claims are
stored outside the target source tree. Freeze this manifest in a local commit
before generating any model answer. The frozen source/manifest commit is
`4624c093031f2bf1d2a7fd9497401d645286620a`.
The runner also pins the manifest SHA-256 to
`42ac429b22f76fc90c234b205c37f43ce5c7391c30dab74102e761bb221330da`.

The first local-explorer attempt returned `needs_review`, selected an unrelated
model-interface constant, and omitted the frozen question set and packing
implementation. Direct source inspection established the runner extension
points. The H-authored draft had nine questions with a 2/3/2/2 distribution and
fourteen required-line mismatches. It omitted the PHP include and the requested
alias, shadowing, receiver and `impl` cases; its Go package declarations and
Rust function placement also did not describe coherent package layouts. The
draft remains ignored benchmark data and is not part of this fixture.

The observer now reports each raw retrieval result and elapsed time, immutable
candidate/bundle snapshots, and the exact selectable refs for each generation
attempt. The scorer separates required-line symbol-range inclusion from exact
packed and selected `(file, line, trimmed text)` tuples; range inclusion is not
semantic retrieval proof. The runner preserves scout and final-answer prompts,
raw outputs, completion metrics, errors, and timings. It copies only source
files into a temporary Git target, verifies all fixture hashes before setup,
before each question and after the run, and checks selected quotes before the
evidence-only answer call. Manual claim correctness and per-case correction
effort remain null until independent review. Abstention is recorded
separately from answer correctness.

Run the evaluator after review with
`node --import tsx scripts/experimental/run-language-eval.ts --output benchmark-data/language-eval/language-eval.json`.
It defaults to the saved local model, serializes calls through the shared
request queue, and applies a 120-second deadline per call. The output records
the model/settings digest, fixture freeze commit, implementation hashes,
selected IDs and effective generation options. Generation wall time includes
queue and API request time; question end-to-end time includes observer and
checkpoint overhead, so neither is labeled model-only latency. Do not start a
second run while the benchmark supervisor lock is held.

Pre-generation verification passed: fixture 4/4, scorer 6/6, runner 3/3, and
local-explore 130/130; repository and script TypeScript checks passed. The
tests check the source-only target, key isolation, retry tuple deduplication,
wrong-text rejection, immutable observer snapshots and malformed-answer
preservation. The completed run and separate answer audit are local ignored
artifacts; the raw run SHA-256 is
`038d2ed36a5df41334edec1a165dcd7245d1a718b6d38820f612644f10333809`.

The completed run used `qwen-context:h-q4_0-24k` with saved `num_ctx=24576` and
`num_predict=16000`; the lead checked 100% GPU placement during the first
question. The deterministic summary recomputed 42 required lines, 28 contained in a
retrieved symbol range, 36 packed before generation and 34 selected. Packing
coverage stayed at 36 across attempts. By language, required/range/packed/any/
selected counts were PHP 16/5/10/10/8, Python 14/12/14/14/14, Go 6/6/6/6/6,
and Rust 6/5/6/6/6. Every result was `needs_review`; these status counts are not
correctness scores. There were 24 scout calls, 12 answer calls, 12 retries, and
12 bounded expansions with `outcome: added`; their per-event duration rounded
to 0 ms, while the added lines appeared in each second-attempt prompt. Raw
required-ref selections improved from 2 to 3 in PHP-03 and PY-03, were
unchanged in the other ten cases, and did not change aggregate packed required
coverage.

End-to-end time summed to 320,677 ms (median 26,146 ms). Index, retrieval and
packing sums were 321, 38 and 35 ms; input checks were 426 ms. Scout and answer
queue/API wall sums were 249,352 and 69,566 ms. Native Ollama completion time
across 36 calls summed to 318,685.477 ms. These measurements include queue,
API, observer and checkpoint costs as labeled by the runner; the tiny fixture
does not support a production indexing-cache conclusion. Generation dominates
this run's measured time.

The source-checked answer audit found five fully correct and cited cases, two
semantically correct cases needing citation/presentation repair, two incorrect
valid answers, one safe abstention, one invalid truncated answer, and one
unsupported dispatch-resolution narrative. All recorded citation locations
match checked source lines; that check does not establish that a citation
entails its claim. Corrected answers for the seven intervention cases and the
category rationale are in the ignored `benchmark-data/language-eval/claim-audit.json`,
pinned to the raw run hash. The lead's measured agent review/correction wall
proxy totals 178 seconds across two dedicated measured lead intervals. It
excludes later integration/report checks and Luna's separate completion work,
and is not human effort, savings or per-case time. Per-case review and
correction times remain null because no per-case allocation was measured. No
general reliability rate is inferred from this single small controlled run.

The local scorer drafts failed repeatedly. The first stopped with truncated JSON
under a 3000-token output ceiling and invalid `Set<Line>.some`, omitted text from its
dedup key, mixed selection into packed coverage, overproduced tests, and
treated negative elapsed time as skipped. A reduced draft redeclared its
selection parameter, returned arrays instead of stage counts, and treated
retrieval ranges as required-record coverage. A typed-body draft omitted a
`Map.set` value, iterated a numeric requirement count, serialized raw objects
instead of trimmed tuple keys, double-counted overlapping ranges/retries, and
duplicated a `retries` property. The typed-stub/test-feedback retry also failed.
For future local coding tasks, first request a typed function signature and
three focused tests; validate output with a standalone typecheck, run the tests
directly, and report each failed assertion before expanding scope. These
failures did not change the fixture freeze.

Next: test filename-anchored PHP top-level guard/key packing on a fresh
non-evaluation fixture. Carry enclosing headers and paired configuration values
into answer context, and add cross-scope citation checks. Measure generation
time before considering an index cache; a cache must later account for working-
tree invalidation. Track the cost of parent-only semantic checks rather than
skipping them for speed.
