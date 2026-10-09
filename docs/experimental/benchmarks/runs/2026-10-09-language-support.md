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

Next: run a fresh PHP/Python-first model evaluation on new sources and questions.
Inspect required evidence, actual selected citations and fallback quality
separately. Do not tune against private evaluation answers or reuse historical
non-error response counts as correctness scores. Real-model selection reliability
for these new language contexts remains unmeasured.
