# H operation planning and method scoping — 2026-10-06

H-only continuation of the [provider-condition screen](2026-10-06-h-provider-conditions.md).
The earlier follow-up is now development evidence; its original artifacts remain
preserved. No other model work is included.

## Change

- Keep operation questions intact before splitting independent clauses. Recognize
  absent replacement files and negated uploading without requesting replacement
  evidence. Pack unset upload state, conditional image fields and the empty fallback.
- Treat capitalized provider names in image-operation questions as search hints.
  Add a provider-deletion checklist for options, result statuses and error paths.
  Explicit named-call/configuration questions retain their existing route.
- For recognized named image operations, pair each condition/error citation with
  its indexed method declaration. Require one method to satisfy the whole checklist;
  competing methods cannot pool partial branches. Nested indexed callables/types
  cannot supply the enclosing method's checks.
- Separate upload error passthrough from the temporary-file helper's catch. Helper
  names inferred by these image profiles are hints; missing matches require review.
  The parent must read the helper to establish suppressed errors or absent behavior.
- Give each packing requirement its first matching window before repeated matches.
  Retain six windows per source, two expansion hops, six files per part, six parts,
  24000 characters, sixteen selected refs per part and two generation calls.

These remain source-selection heuristics. Same-method membership does not prove
condition dominance, runtime provider identity or semantic completeness. All
natural operation plans retain `needs_review`. Defaults, feature gates, saved
model settings and target sources are unchanged.

## Verification

Pass: 45 scout/relationship/operation tests, 17 model-budget/tokenizer tests,
3 feature tests, 8 Quality Review tests and 2 grader tests (**75 total**).
Seven new regressions cover negation/provider phrasing, distant fallback packing,
wrong-method evidence, competing methods, nested functions, cleanup-error contrast
and the scout's selection-to-review path.

TypeScript passes with the previously archived config excluding only the existing
Vitest test. Standard checking retains the pre-existing missing `vitest` dependency.

## Development regression

The [development fixture](2026-10-06-h-operation-scoping-development-queries.json)
reuses the preceding three questions and exact line rubrics. Source hashes,
implementation copies/hashes and the fixture are frozen before generation. This
is a development regression, not independent accuracy or an unseen-repository test.
No tuning follows this screen.

| Case | Required supplied | Required selected | Status | Seconds |
|---|---:|---:|---|---:|
| Provider deletion options/results/errors | 9/9 | 9/9 | `needs_review` | 47.0 |
| Update without replacement file | 15/15 | 14/15 | `needs_review` | 60.9 |
| Suppressed temporary-file cleanup failure | 13/13 | 13/13 | `needs_review` | 67.0 |

Complete exact-rubric positives: **1/2**, versus 0/2 on the preceding screen.
Safe negative status: **1/1**. The negative also selects every minimum rubric line
and avoids the frozen deletion-error distractor. Full helper inspection confirms
unlink errors are caught without rethrowing; upload errors are surfaced separately.
This is source review, not an executed provider-error test.

The absent-file case now selects the method declaration, missing-record guard,
optional-file guard, unset upload state, persistence and empty fallback. It omits
line 127, the upload assignment under the file guard, although that line is packed.
Complete source packing and a satisfied heuristic checklist still do not establish
complete selection or an answer. Provider deletion and cleanup selection improved
on these reused questions; parent review effort and broader reliability remain unmeasured.

All six generation calls stop naturally, and selected quotes match source. All
83 loaded-model placement samples show **22% CPU / 78% GPU**. This is not GPU-only
performance or sustained-output evidence, and timings do not establish a speedup.
H inherits 50000 context, the 2048 scout reserve, `think:false` and the normal
120-second per-call deadline. Effective daemon settings remain q4_0 KV, Flash
Attention enabled and one slot.

Ignored `benchmark-data/h-operation-scoping/` stores raw prompts/responses,
separate grades, implementation copies/hashes, fixture/source identities, daemon
settings, placement samples and supervisor state. Start/end freezes match, all
artifacts are complete, both benchmark locks are released, the supervisor is gone
and H is unloaded. No tuning or external retry followed this screen.

## Next checkpoint

The remaining known selection gap is the guarded upload assignment in the
absent-file path. Freeze structurally different questions from another repository
before further tuning. Measure useful selection, answer completeness, parent review and fallback
effort separately. GPU-only context fit and sustained-output fidelity remain
separate experiments; this implementation does not establish either.
