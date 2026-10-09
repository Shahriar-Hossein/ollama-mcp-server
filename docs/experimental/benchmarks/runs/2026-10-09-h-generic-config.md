# H generic configuration selection

Continues the resolver work at `04268ce`. The earlier storage-driver screen
remains frozen and was not rerun or used as a development fixture.

## Change

Named uppercase configuration keys now anchor JS/TS `get`/`getOrThrow` reads.
Packing preserves separated getter, constructor, condition and outcome windows
within the existing six-file, two-hop and character limits. Named keys guide
neighbor ranking; generic return/getter matches do not receive that priority.

Selection shortlists connect each named read to its multiline arguments and
enclosing if/else conditions. Direct return/throw outcomes in the reader's
callable retain their conditions; nested callables cannot substitute outcomes.
Missing named reads remain unresolved. Short literal defaults such as `0,` or
`'',` can be cited only as complete checked source lines, not substrings.
Ranked symbol excerpts now use complete source lines at their boundaries;
variable byte ranges previously dropped declaration keywords or punctuation.

These checks do not resolve injected providers, configuration initialization or
data flow. Other outcomes in the same reader can be unrelated. Switch/case,
dynamic keys and arbitrary getter APIs remain outside these relationships.
Configuration questions always require parent review, even with full citations.

## Verification

All 60 scout tests pass. Seven new regressions cover typed multiline reads,
distant defaults and startup rejection, provider credential packing, else
guards, nested callables, missing keys, exact short literals and end-to-end
selection/review status, expression arrow readers and symbol-line boundaries.
`npm run check` passes with existing lint warnings.
Touched TypeScript files are formatted with Biome.

The development fixtures use a delivery channel with a local fallback,
live-stage rejection and an imported relay constructor. The model is stubbed
in these tests; they verify implementation behavior, not H selection accuracy.

## Frozen screen

The [HTTP configuration fixture](2026-10-09-h-generic-config-queries.json)
contains two synthetic source files, nine positive rubric lines and a negative
question whose key appears only in a comment. The lead froze source hashes,
questions and rubric after implementation/testing and before generation.
This is not an independent review or unseen-repository accuracy measurement.

The detached runner checked fixture/source hashes and executed cases sequentially
under one lock. H used its saved 24576 context and 2048 scout output limit.
The positive logged 9/9 supplied and 9/9 selected lines, `needs_review`, two
calls and 22.945 seconds. The negative then failed the exact-source-line audit:
a ranked variable excerpt cited `idleMs = settings.get<number>(` while its
source line began `const idleMs`. The runner aborted before writing its full
artifact. Its lock was confirmed released.

The source excerpt bug was fixed with a regression. No model rerun followed;
the interrupted screen does not validate the final implementation. The positive
log is diagnostic evidence, not an accuracy result. Negative output was not
persisted before the audit failed, so it cannot be scored. The log, runner and
failure summary remain under ignored `benchmark-data/` as
`h-generic-config-2026-10-09.log`, `h-generic-config-2026-10-09-runner.ts` and
`h-generic-config-2026-10-09-audit.json`.

The retained runner now checkpoints each answer before auditing; it has not
been rerun. Freeze fresh questions before evaluating the final implementation;
do not rerun this screen.

## Next step

Carry answer checkpointing into the next reproducible benchmark runner. Develop
configuration initialization and provider-provenance cases separately.
Then freeze fresh real-source questions before measuring again. Keep supplied
evidence, selected evidence and parent completion separate.

Continued in [configuration initialization and provenance](2026-10-09-h-config-provenance.md).
