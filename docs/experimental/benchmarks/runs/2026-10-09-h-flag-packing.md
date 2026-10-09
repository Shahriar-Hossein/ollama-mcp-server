# H flag helper and consumer packing

The working tree started clean at `706f42b`. H remains
`qwen-context:h-q4_0-24k`; no model or daemon settings changed.

## Change

Flag mappings can be packed without their resolver branches. Import expansion
can also find a consumer while selecting only its import or initialization,
missing a distant guard whose property name differs from the question wording.

The scout now reads statically resolved helpers called by supplied flag lines.
It derives property names from those mappings to anchor consumer windows and
rank import neighbors. Named properties take priority over unrelated flags.
Existing file, hop, character, output and retry limits still apply. This adds
context; it does not establish configuration provenance or completeness.

## Verification

A synthetic fixture uses a long resolver, an aliased configuration import and
a distant guard with an opaque property name. Before the fix, the resolver's
true branch was absent. Afterward, the mapping, true/false branches, validation
error, guard and guarded call reach the bundle with exact source line numbers.

All 49 scout tests and three feature tests pass. `npm run check` passes with
existing lint warnings. A broad initial consumer expansion exceeded one fixture's
conservative byte budget; narrowing to named properties restored that check.

## Live development probe

Question: “Which environment variables gate the local worker and cloud Claude
worker, how are they resolved independently from ENABLE_EXPERIMENTAL, and where
are their guarded registrations?”

The rubric requires nine source lines: two flag mappings, three resolver
branches/error lines, and two guard/call pairs. This reuses a reported failure
as development input; it is not an independent held-out evaluation.

The initial live probe took 101 seconds and two model calls. It packed 9/9
required lines and selected 6/9, omitting all three resolver lines. Its status
was `needs_review`. Raw artifacts are ignored under
`benchmark-data/h-flags-2026-10-09-initial.json`.

The final narrowed implementation took 80 seconds and two model calls, again
packing 9/9 and selecting 6/9 with `needs_review`. All nine rubric lines were
checked against source. The final artifact is
`benchmark-data/h-flags-2026-10-09.json`. These two probes do not establish
general quality or a speed improvement.

## Next step

Freeze different configuration questions from another repository before tuning
selection. Evaluate supplied context, selected evidence and parent completion
separately. A larger context window does not address this selection failure.
