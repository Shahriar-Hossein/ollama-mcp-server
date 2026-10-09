# H configuration initialization and provider provenance

Continues [generic configuration selection](2026-10-09-h-generic-config.md).
The earlier storage-driver and synthetic HTTP screens remain frozen and were
not rerun or used as development fixtures.

## Change

Initialization questions pack imported Nest `ConfigModule.forRoot`/`forRootAsync`
call context, including aliases and multiline options. Source checklists pair
the import and call; they do not prove module registration, environment loading
or dependency-container behavior. Recognized same-name bindings remain ambiguous.

Provider questions anchor literal configuration reads to direct factory
`provide`, `inject` and parameter declarations, including the receiver's position
in the injection array. Constructor readers retain their matching parameter;
direct TypeScript parameter properties also supply context for member reads.
Comments do not invalidate object fields. Missing bindings, nested callbacks,
spreads, duplicate fields, dynamic injection arrays and recognized shadowing
remain unresolved. Other APIs, aliases of readers and complex providers remain
outside these checks. Every such question requires parent review.

Packing retains the six-file and existing character/input limits. Oversized
initialization options refuse generation rather than silently trimming obligations.
Runtime provider scope, overrides, lifecycle order and value provenance still
need interpretation by the parent.

## Verification

All 66 scout tests pass. Six new regressions cover initialization aliases/options,
factory token/injection context, constructor readers, distant packing, missing
context and review/overflow behavior. Generation is stubbed in development tests.
`npm run check` passes with existing lint warnings. Touched TypeScript is formatted.

The reusable `scripts/experimental/run-local-explore-repo-smoke.ts` now saves
each raw answer before quote/source/fixture/rubric audits. Failure retains the
answer and an audit error with `complete: false`. Optional rubrics score supplied
and selected exact source lines separately; parent completion stays pending.
Its mocked subprocess test passes both successful scoring and an intentional
audit failure. The runner and its test also pass an explicit TypeScript check.

## Fresh source screen

The [frozen questions](2026-10-09-h-config-provenance-queries.json) use four source
files from Nest Auth. A bounded fresh-context Luna search found the source;
the lead verified and froze hashes, questions and rubric after development
checks and before generation. The JWT strategy had a pre-existing working-tree
change; hashes identify the actual snapshot, not just its base commit.

This is a real-source slice, not unseen-repository accuracy. An earlier generic
local scout query on this repository returned low-confidence test/setup citations.
That probe is recorded in field feedback and was not scored as this screen.

One detached, locked supervisor ran the three questions sequentially with
`qwen-context:h-q4_0-24k` (digest `72e74925c51e`), saved 24576 context, 2048 scout
output, `think: false`. All six generations stopped normally. Every audit passed;
the final artifact is complete and the supervisor and lock owner are gone.
No tuning or rerun followed.

| Question | Supplied rubric lines | Selected rubric lines | Time (s) | Status | Parent completion |
|---|---:|---:|---:|---|---|
| Global initialization | 5/5 | 5/5 | 25.644 | needs_review | Complete from selected source |
| Secret provenance contrast | 8/8 | 5/8 | 21.013 | needs_review | Complete with additional source reads |
| Absent injected signer factory | 5/5 | 5/5 | 22.426 | needs_review | Complete after bounded absence review |

Each question used two calls. Provenance selection omitted the `ConfigService`
import, `JwtModule.register` call and constant declaration despite all being
supplied. It retained an unused constant import from the strategy; that import
cannot establish the reader's value source. The negative also retained constructor
citations from the other reader. Generic registration checks request a guard
that this module does not have. Safe review status is not semantic completeness.

Parent inspection establishes distinct declarations: the strategy reads through
its constructor's configuration service; the signer receives an imported constant
captured from `process.env` during module evaluation. These lines do not establish
environment preload timing or equality of the resulting secret values. Absence
of a signer factory is limited to the inspected AuthModule source.

Raw answers, prompts, metrics and audits remain unchanged under ignored
`benchmark-data/h-config-provenance-2026-10-09.json`. The separate
`h-config-provenance-2026-10-09-parent-review.json` records parent conclusions and
omitted rubric lines. The `.log`, frozen `-source/` Git snapshot and original
`-source.diff` preserve the run. Fixture SHA-256:
`d22aa8a2c929fd42286dad41c52653978dc70d2f326abbba20d6f63fba2816e0`.

## Next step

Develop separate cases for imported constant/property provenance and configuration
initialization order. Bind reader declarations to the named owner and distinguish
direct registration from guarded tool registration. Preserve useful partial
citations, but do not treat a nearby constructor or unused import as provenance.
Then freeze different real-source questions before measuring again; do not rerun
or tune the screen above. Keep parent completion separate from model selection.
