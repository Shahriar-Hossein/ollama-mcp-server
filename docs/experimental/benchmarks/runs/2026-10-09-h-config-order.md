# H imported configuration values and initialization order

Continues [initialization and provider provenance](2026-10-09-h-config-provenance.md).
Earlier screens remain frozen and were not rerun or used as development fixtures.

## Change

Direct named imports and aliases now pair an actual value use with an exported
top-level const initializer. Direct object properties retain their declaration
and matching field; spreads and duplicate keys remain unresolved. Named readers
retain their class/function/method declaration, including exported Nest class
decorators. Nearby constructors and unused imports cannot satisfy the binding.
Recognized shadowing, mutable declarations, type-only imports, default exports,
reexports and deeper property chains stay outside supported provenance.

Initialization context includes Nest setup and dotenv named/default/namespace
loader calls or the `dotenv/config` preload import. Order questions retain source
context and an explicit unresolved parent-review obligation. Neither import
adjacency nor source order proves runtime preload, loader success or value equality.
Direct registration calls no longer require a tool-registration guard; requested
guarded tool registration still requires the guard.

The existing six-file, input, character and two-call limits remain. Oversized
constant initializers refuse generation. All configuration semantics require
parent review. The runner records the new module's hash and route controls.

## Verification

All 74 scout tests pass. Eight new regressions cover scalar aliases, object
properties, named readers, shadowing/mutability/reexports, dotenv loaders, order
review, direct registration and end-to-end selection/overflow. Generation is
stubbed in development tests. The runner regression and its explicit TypeScript
check pass. `npm run check` passes with lint warnings.

## Fresh source screen

A bounded fresh-context Luna search found loader/order context in Codesyard
Backend. The lead verified and froze two source files, hashes, questions and
rubrics after development checks and before generation. The files have no local
changes relative to `e61c7d1d9e5666d7bff544a9a0c7162621c45f64`.
The [frozen questions](2026-10-09-h-config-order-queries.json) measure loader/order
context and the default-exported instance boundary. The bounded search did not
find a fresh supported named-constant positive. These results do not validate
real-source scalar/property selection or unseen-repository accuracy.

One detached, locked supervisor ran both questions sequentially with
`qwen-context:h-q4_0-24k`, digest `72e74925c51e`, saved 24576 context, 2048 scout
output and `think: false`. All four generations stopped normally. Both audits
passed; the artifact is complete, the supervisor is gone and the lock is free.
No tuning or rerun followed.

| Question | Supplied rubric lines | Selected rubric lines | Time (s) | Status | Parent completion |
|---|---:|---:|---:|---|---|
| Database initialization order | 9/9 | 7/9 | 37.246 | needs_review | Complete with additional source reads; runtime timing unestablished |
| Default-instance provider boundary | 9/9 | 8/9 | 26.243 | needs_review | Complete after bounded source review |

Order selection omitted the database class declaration and the importing module's
reader call. Provider selection omitted the reader method declaration. Both
questions received all required lines but added unrelated module/provider-token
imports as unresolved constant-provenance requirements. Default-import instance
resolution remains unsupported. Safe review status does not establish completeness.

Parent inspection identifies a dotenv call before construction of a default-exported
database service, and its use alongside Nest initialization in the importing module.
The service receives `process.env` by object reference; it does not snapshot scalar
values. The inspected module has no factory injecting the requested database key.
These conclusions do not establish dotenv success, external preload timing or
dependency-container behavior.

Raw answers, prompts, metrics and audits remain unchanged under ignored
`benchmark-data/h-config-order-2026-10-09.json`. Separate `-parent-review.json`
records conclusions and omitted rubric lines. The `-source/` Git snapshot,
`-source.diff`, `-implementation/`, supervisor and log preserve reproduction inputs.
Fixture SHA-256: `6cda6a3215015518f0ffef996a46e8bbc00eda36a41124cc61ebc9796c31c5ba`.

## Next step

Develop separate cases distinguishing actual configuration-value imports from
module/provider tokens. Add default-import instance and constructor-argument
context, preserving the difference between an environment object reference and
scalar capture. Strengthen reader-call/declaration selection, then freeze fresh
questions, including a supported real-source named-constant positive. Do not tune
or rerun this screen; keep parent completion separate from model selection.
