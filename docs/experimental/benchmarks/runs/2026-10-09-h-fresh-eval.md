# H fresh real-app evaluation (2026-10-09)

First check of `local_explore_repo` on unfamiliar application code after the
binding screen. Answer keys were written and frozen before generation.

- Fixtures: [sharks](2026-10-09-h-fresh-eval-sharks.json) (Next.js app),
  [infivro](2026-10-09-h-fresh-eval-infivro.json) (WordPress plugin, PHP + JS).
- Model: `qwen-context:h-q4_0-24k`, one fixture at a time.
- Implementation: frozen copy with the Nest `supporting_context` fix
  (`benchmark-data/h-fresh-eval-2026-10-09-implementation-manifest.json`).
  None of these questions use Nest metadata, so that fix is not exercised here.
- Raw runs: `benchmark-data/h-fresh-eval-2026-10-09-{sharks,infivro}-h.json`.
- `lms` had no usable JS/TS. No default-import instance case exists in any
  scouted project, so that gap stays open.

## Results

| Question | Kind | Required | Supplied | Selected | Status | Time |
|---|---|---:|---:|---:|---|---:|
| Course config arrays | positive | 8 | 7 | 4 | `needs_review` | 32.1 s |
| Navbar alias + local shadow | positive | 6 | 6 | 5 | `needs_review` | 52.7 s |
| Navbar env variable | negative | – | – | – | `needs_review`, abstained | 30.7 s |
| Coupon text PHP→JS | positive | 8 | 8 | 7 | `needs_review` | 75.8 s |
| Copy delay env/setting | negative | – | – | – | `needs_review`, abstained | 32.8 s |

All quotes matched source. No unsupported claims in either negative: both said
no variable was found (the infivro one cited the literal `2000`).

## What H missed

- Course arrays: line 62 (`courseInfoItems.map`) was never retrieved. H also
  skipped the `courseDetails.map` use (116, 119) and the `"Support"` label (32)
  while selecting its value line (33).
- Navbar: the `export const menuItems` declaration in `nav-sections.ts`.
- Coupon text: the enclosing `enqueue_styles()` declaration.

Same pattern as the binding screen: H tends to drop **enclosing declarations**
and **the key paired with a selected value**. This holds on fresh code, not
just Nest.

## Smaller issues

- Infivro negative evidence lists line 24 twice. Selection does not dedupe.
- Negatives still return `needs_review`, not a distinct "not found" status.

## Parent review

All five answers were completed from the frozen keys with reads inside the
snapshots. The course question needed the most extra reading (4 lines).

## Limits

Two private single-author projects, five questions, one run each. This is a
first fresh signal, not a reliability measure. This set is now used; do not
tune against it.

## Follow-up fix (same day, not yet re-evaluated)

`supporting_context` now also adds, for selected JS/TS lines: the enclosing
declaration header, up to three scalar sibling properties, and the first use
of each name from a selected import. Selected evidence is deduped by
file:line. Developed on synthetic tests only (102/102 pass).

Post-hoc replay of the new rules on this run's saved selections (no model
rerun) adds 4 of the 7 missed lines: CourseDetail 62 and 116, couseConfig 32
and nav-sections 1. It still misses CourseDetail 119 and the PHP declaration
(PHP is not handled). The rules were written after seeing these misses, so the
replay is a diagnostic, not evidence of improvement.

## PHP declaration context (same day, synthetic checks only)

PHP selections now add the nearest declaration name line, including methods,
classes, interfaces, traits and enums. Anonymous functions, arrow functions
and anonymous classes add their own keyword line. Attributes are excluded;
selected headers never acquire an outer scope's header. Malformed scopes and
invalid selected lines add nothing. The existing 12-entry cap and source-line
deduplication apply. These extras do not change evidence, coverage or status.

Tests use synthetic PHP sources covering nested scopes, attributes, multiline
names, malformed code and invalid selections. No fresh model evaluation has
been run for this addition; the earlier replay remains diagnostic only.

## Next

- Run a new fresh set (new sources) to measure the fix.
- Measure PHP declaration support on fresh sources.
- `supporting_context` now surfaces line 62, but packing still drops it
  because the query never names `courseInfoItems`. CourseDetail got windows 2–38 and 112–131;
  nothing follows the line-6 imports to their first uses. Consider a use window per named import from a
  matched module.
