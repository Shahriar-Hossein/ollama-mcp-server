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

Next: test a fresh bounded Python cross-scope citation check on known-bad and
clean examples before routing. Flag inconsistent lexical owners while leaving
binding targets unresolved. Start review/correction clocks before inspection and
drafting. PHP aliases/includes and Python package imports remain future bounded
work. Keep six-file/24,000-character packing bounds; working-tree cache
invalidation and aggregate checks remain pending.
