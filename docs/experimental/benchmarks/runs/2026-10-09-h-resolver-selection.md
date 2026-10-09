# H flag resolver selection

Continues the packing work at `5fca4fe`, with these selection changes in the
working tree. H remains `qwen-context:h-q4_0-24k`, with 24576 context and
2048 scout output tokens. Model and daemon settings are unchanged.

## Change

The worker-flags question previously supplied all nine required lines but
selected only six. Its checklist did not shortlist resolver branches.

Flag-resolution requests now get source relationships connecting a mapping to
its statically resolved helper declaration, local inputs and direct return/throw
outcomes. Each outcome includes enclosing if/else guards. Imported aliases and
arrow helpers work; shadowing, missing helpers and missing named flags remain
unresolved. Nested callables cannot substitute their outcomes. Singular
environment-variable questions require one mapping rather than two.

Recognition covers literal `ENABLE_*`/`*_ENABLED` arguments to direct JS/TS
helper calls. These are selection constraints, not a general configuration
interpreter. Flag semantics retain the unchecked-completeness requirement;
citations alone cannot establish runtime behavior.

## Verification

All 53 scout tests pass. New tests cover omission, a competing helper, imported
aliases, arrow helpers, else guards, nested callables, shadowing, missing flags
and end-to-end review status. `npm run check` passes with existing lint warnings.

An independent read-only source review authored two storage-driver questions.
The lead verified source windows and froze the questions, sixteen positive
rubric lines, seven negative lines and five source hashes before implementation
or generation. The source revision is
`b22ec006e2b44aa94b5edd7263ccdefee85899fb`. This repository was used for earlier
image-operation slices; these are different configuration questions, not
unseen-repository accuracy.

The frozen fixture is
[the configuration question set](2026-10-09-h-config-selection-queries.json).
Source copies were evaluated in a temporary Git repository; original target
sources were read-only. The runner checked source hashes and each selected
quote against its source line. It ran cases sequentially under one lock and
saved `benchmark-data/h-selection-2026-10-09.json` (ignored).

| Case | Required | Supplied | Selected | Status | Calls | Time |
|---|---:|---:|---:|---|---:|---:|
| Worker flags, development | 9 | 9 | 9 | needs_review | 2 | 94 s |
| Storage driver/startup, frozen positive | 16 | 15 | 9 | needs_review | 2 | 37 s |
| Absent s3 driver, frozen negative | 7 | 7 | 7 | needs_review | 2 | 33 s |

The worker development selection improves from 6/9 to 9/9. The model still
reports extra unresolved helper wording despite complete rubric citations;
parent review remains necessary. No general accuracy or speed improvement is
established.

The positive misses `ConfigModule.forRoot({ isGlobal: true })` in packing. It
omits supplied upload-directory/default/static-serving lines, the production
condition/error message and two R2 configuration lines from selection. The
negative provides the factory fallback and production rejection evidence;
the parent inspected the factory to establish absence of an `s3` branch.
An S3-compatible client in the R2 provider does not establish an `s3` driver.

No implementation tuning or rerun followed these frozen validation answers.

## Next step

Use separate development cases for generic configuration APIs and their
cross-file consumers. Preserve provider initialization and startup conditions
as well as mappings, then freeze new questions before evaluating selection.
Keep supplied evidence, selected evidence and parent completion separate.
