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

Verification before generation: fixture 4/4 tests, scorer 6/6, runner 3/3, and
the local-explore suite 130/130 passed; repository and script TypeScript checks
passed. Logs are ignored under `benchmark-data/language-eval/check-*.log`.
The suite checks that the source target contains no keys, the final prompt
contains only checked selected evidence, retries do not double-count exact
tuples, wrong text at the same location earns no credit, observer snapshots
cannot mutate packing input, and malformed final-answer output remains in the
audit artifact. No model-generation evaluation has run yet.

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

Next: lead reviews this runner diff, then starts one detached, locked full
12-question evaluation. After its artifact is complete, audit H's claim and
citation correctness against the frozen manifest and enter measured aggregate
review/correction effort without inventing per-question effort allocations.
