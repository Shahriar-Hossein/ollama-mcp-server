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

Next: test filename-anchored PHP top-level guard/key packing on a fresh
non-evaluation fixture. Carry enclosing headers and paired configuration values
into answer context, then check citations against function scope. Measure
generation time before considering index caching; any cache must handle
working-tree invalidation. Keep parent-only semantic checks visible in timing
reports rather than skipping them.
