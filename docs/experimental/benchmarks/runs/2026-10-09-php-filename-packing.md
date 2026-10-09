# PHP filename packing development checkpoint

Explicit PHP filename hints now reserve source candidates before lexical ranking.
Git supplies tracked paths through argv and NUL separation; reads use checked
realpaths. Unique basenames and exact qualified paths follow the pure helper.
Symbol-free top-level guards, literal entries and include lines can reach packing.

The existing six-file, source-window and 24,000-character bounds remain in force.
PHP patterns select lexical context. They do not resolve includes, aliases,
namespaces or runtime behavior; ambiguous basenames add no filename candidate.
Ordinary indexed retrieval remains independent of filename hints.

Validation: seven direct integration tests and the final full scout suite
(144 tests) passed. Typecheck passed; changed-file lint retained two existing non-null assertion warnings.
Fresh fixture sources remained unchanged. The frozen multilingual evaluation was
neither changed nor rerun.

The fresh H development probe completed on a separate source-only temporary Git
root. Its manifest and required rows stayed outside the retrieval target. Shared
`generateResult` serialized requests; observer refs were saved before each call.
All source hashes, required rows, supplied refs and selected quotes were checked.

| Case | Required | Initial supplied | Any supplied | Selected | Status | Calls | Elapsed ms |
|---|---:|---:|---:|---:|---|---:|---:|
| DEV-PHP-A | 5 | 5 | 5 | 5 | needs_review | 2 | 21617 |
| DEV-PHP-B | 1 | 1 | 1 | 1 | needs_review | 2 | 7536 |

Six of six required lines were initially supplied and selected; four generation
calls completed with stop reasons. The two cases took 29,153 ms together,
including setup, queue waits and request time. These are evidence-selection
observations. There was no answer synthesis or answer-correctness score; two
cases cannot establish general accuracy or production reliability.

Ignored reproduction artifacts are under
`benchmark-data/language-eval/php-development/`: `fixture.json`, `probe.ts`,
`result.json`, `probe.log` and `repository-root.txt`. The source-only root path is
ephemeral. Manifest source hashes and exact required rows were validated before
model setup/generation. Probe preflight and standalone script typecheck passed.

SHA-256 provenance:

- Development manifest: `496d1c2757de9d87d474cc57aaa9656a75852e24d2967a62885571cebd9ad6ec`
- Development result: `7121dcda347425bb827a6c4d6a224830651b8462b22d2eef59ef9d4fda054151`

A bounded H report draft using precomputed facts took 4,214 ms. Its finding and
limitation matched the checked data: both cases require review, and evidence
selection does not verify answer correctness. This successful narrative task
does not establish model reliability for calculation or other tasks.

Next: exercise Python/PHP enclosing declaration context and cross-scope citations
on another bounded relationship fixture. Keep include/alias semantics unresolved
and the six-file/24,000-character caps visible. Filename syntax remains bounded
to safe ASCII root-relative components; large-source windows can omit guards.
