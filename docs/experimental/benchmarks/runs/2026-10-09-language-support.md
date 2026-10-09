# Deterministic language support checkpoint — 2026-10-09

Completed sequential pieces: PHP source context, Python source context, Go
index/scout context, shared UTF-8 range correction, and Rust index/scout context.
The supported index now covers TypeScript, JavaScript, PHP, Python, Go and Rust.
Default feature flags, registrations and read-only target access are unchanged.

Synthetic fixtures cover symbols, outline/read-symbol, body-only retrieval,
source-backed ranges after BMP/astral text, and mocked scout citations with
`needs_review`. Supporting-context checks cover nearest scopes, closures,
malformed sources, selected headers, deduplication and the global twelve-line cap.
These checks establish implementation behavior, not real-model reliability.
Final integrated checks: Explorer 7/7, full scout 129/129, feature flags 3/3;
lint and typecheck pass with existing lint warnings and no errors.

Go and Rust calls/imports/references stay unresolved. Rust method names retain
the literal impl header to distinguish source declarations; trait/receiver
binding, crate paths, macros and cfg evaluation remain outside this scope.
Go/Rust callable and package semantics still require parent review; lexical
context and mocked selections do not establish runtime behavior.

The fresh 12-case PHP/Python/Go/Rust evaluation completed on frozen source
fixtures. It selected 34 of 42 required lines; all cases returned
`needs_review`, which is a pipeline status rather than an answer score. A
separate source audit found mixed outcomes and corrected seven cases. See the
[language evaluation report](2026-10-09-language-eval.md); it records stage
coverage, claim/citation distinctions and the small-sample limitation.

The separate filename-packing development piece now covers tracked PHP files
without symbols. Its fresh two-case probe supplied and selected all six required
lines; both cases stayed `needs_review`. This is evidence selection, not answer
correctness or a revision of the frozen evaluation. See the
[PHP packing checkpoint](2026-10-09-php-filename-packing.md) for hashes and limits.
The final scout suite passed 144/144; typecheck passed with existing lint warnings.

The fresh four-case [scope comparison](2026-10-09-scope-eval.md) completed with
identical selected tuples and one false structured claim in each run. Optional
lexical answer context establishes no improvement; source audits separate claim
truth, citation support and wording. The original frozen evaluation was unchanged
and was not rerun.

The fresh two-question [Python citation evaluation](2026-10-09-citation-eval.md)
completed at `be8a1e4` against freeze `fc76f1f`. The six static cases establish
lexical review cues only: both known wrong claims and a true cross-scope contrast
are flagged. The inline answer is complete; background drops the module dictionary
values despite complete packing and emits unfinished semantic strings under a
normal stop. Independent source review supplies one corrected answer without a
model rerun. Original language/scope freezes and raw artifacts remain unchanged.

Next: develop bounded Python named module-dictionary declaration/value retention
in selected context, then freeze fresh questions. Separately test incomplete
answer-string detection; valid JSON and normal stops do not prove completeness.
Do not generalize these cues into binding/import resolution or routing claims.
PHP aliases/includes and Python package imports remain future bounded work. Keep
six-file/24,000-character packing bounds; working-tree cache invalidation and
aggregate checks remain pending.

Update: Python named-dictionary source rows are now a relationship check
(`8f91542`). On four fresh frozen questions the enhanced run selected 17/17
required rows (baseline 14/17) and 3/4 answers were correct and complete
(baseline 1/4). The parameter-shadow case still fails with a truncated answer.
Small, lead-reviewed, one run; see the selection report. Incomplete-answer
detection and the other Next items above remain open.
