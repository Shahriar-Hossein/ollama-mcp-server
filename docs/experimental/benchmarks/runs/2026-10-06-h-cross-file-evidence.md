# H cross-file evidence — 2026-10-06

H now selects all required lines for both previous NestJS development
questions. The new synthetic contract screen also supplies and selects both
complete chains, and abstains on both absent calls.

## Change

- Follow static caller/callee edges and local imports in both directions,
  with at most two hops and six files per question part. Unresolved member
  calls remain unresolved; import adjacency supplies context only.
- Pack every retrieved chain file for each part instead of dividing six
  file bundles between parts. Merge overlapping source lines across parts.
  Refuse character/context overflow before generation; preserve output limits.
- Build selection shortlists for explicit named calls, returned fields,
  configuration assignment/use, and signing/verification/extraction operations.
  Missing checklist elements remain unresolved even if the model cites nearby
  source and claims high confidence. Retries retain checked partial citations.
- Keep the existing two-call limit and one bounded follow-up read. Follow-up
  source remains subject to the 24000-character cap.

Packing lives in `src/experimental/tools/local-explore-packing.ts`. Separating
it also avoids the native parser failure encountered when the original scout
file grew beyond its input buffer limit. Feature gating and target read-only
behavior are unchanged.

## Evaluation

One H run per set, with saved 50000 context, the 2048 scout output reserve,
`think:false`, and the ordinary 120-second per-call deadline. Source/fixture
hashes are checked before running and grading. The grader rejects missing or
duplicate questions and changed source/fixture identities.

The seven-file NestJS snapshot and four previously evaluated questions are
development examples. Their source hashes still match the original fixture.
The new [synthetic fixture](2026-10-06-h-cross-file-queries.json) freezes seven
source files and four questions before implementation/model calls. It includes
two import/configuration chains, two absent-call questions, and a distractor
with different configuration values. Question wording was known to the
implementer: this is a synthetic contract screen, not independent real-repo
held-out accuracy. No model-output-driven tuning or retries of the final run
were performed; the scout's internal bounded retry is part of the route.

| Set / case | Required evidence supplied | Complete selection / appropriate abstention | Seconds |
|---|---|---|---:|
| Development: login/signing/expiry | 4/4 | Complete 4/4 | 20.1 |
| Development: guard/strategy | 5/5 | Complete 5/5 | 14.3 |
| Development: absent refresh endpoint | — | `needs_review`, unresolved | 33.4 |
| Development: absent route guard | — | `needs_review`, unresolved | 18.9 |
| Synthetic: invoice/pricing/tax setting | 4/4 | Complete 4/4 | 7.0 |
| Synthetic: parcel/transport/retry setting | 4/4 | Complete 4/4 | 6.6 |
| Synthetic: absent refund call | — | `needs_review`, unresolved | 10.4 |
| Synthetic: absent cancellation call | — | `needs_review`, unresolved | 10.4 |

Complete positives: **2/2 development**, **2/2 synthetic**. Appropriate negative
status: **2/2 in each set**. All returned quotes match source. All twelve model
calls stop naturally. Positive cases use one call each; negatives use two.

Manual review found no selected distractors. The two extra positive guard
citations show header extraction and its caller. The negative route-guard
case retains four nearby controller citations; these do not establish the
requested decorator, and its unresolved status is retained. Safe abstention
is a status contract, not proof of repository-wide absence.

All 57 loaded-model placement samples report 100% GPU. The prior report's
resumed runner used mixed placement, so these timings do not establish a
speedup. Sustained long-output/GPU-fit work remains separate.

## Verification and checkpoint

- Pass: 19 scout, 17 model-budget/tokenizer, 3 feature and 8 Quality Review
  fixtures. The new scout fixtures cover multi-part file reservation,
  overlapping-line deduplication, two-hop imports, named-call declaration/comment
  rejection, configuration assignment/use, and unresolved missing calls.
- TypeScript passes for source and the changed benchmark CLIs with only the
  pre-existing missing-`vitest` experimental test excluded. Standard
  `npx tsc --noEmit` still reports that missing dependency.
- Grader checks reject a duplicate question, a changed fixture, and a changed
  source hash. Whitespace checks pass.
- Ignored artifacts: `benchmark-data/h-cross-file/` contains the synthetic Git
  snapshot, implementation snapshot, raw requests/results, grades, placement
  samples and supervisor logs. Both stages completed; the shared supervisor
  lock was released. H was unloaded afterward; the loaded-model list is empty.
  Earlier artifacts remain untouched.
- Next: freeze independently authored questions on a fresh sanitized real
  repository after the implementation is fixed. Include unresolved member
  calls, configuration behind more than two hops, competing providers and
  misleading executable matches. Score chain relevance separately from literal
  quote integrity and appropriate abstention. The syntactic checklists do not
  verify caller identity or configuration provenance.

Parent review effort, broad held-out quality, long-input fidelity and sustained
GPU-only long output remain unmeasured by this run.
