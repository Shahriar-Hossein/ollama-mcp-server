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
before generating any model answer. After that commit, implement the runner
observer fields for raw retrieval, immutable packed candidates, selected
citations, manual claim correctness and correction effort.

The first local-explorer attempt returned `needs_review`, selected an unrelated
model-interface constant, and omitted the frozen question set and packing
implementation. Direct source inspection established the runner extension
points. The H-authored draft had nine questions with a 2/3/2/2 distribution and
fourteen required-line mismatches. It omitted the PHP include and the requested
alias, shadowing, receiver and `impl` cases; its Go package declarations and
Rust function placement also did not describe coherent package layouts. The
draft remains ignored benchmark data and is not part of this fixture.

Next: review and commit this source set and manifest; only then run the frozen
evaluation and compare retrieved, packed-before-generation and selected
evidence, with manual claim and correction-effort review.
