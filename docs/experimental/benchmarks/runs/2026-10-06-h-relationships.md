# H caller and configuration relationships — 2026-10-06

Explicit named-call requests now check the caller's identity. Supported direct
object settings require the assignment and a use of that same bound provider.
The synthetic regression still passes. A fresh real-source screen exposes
incomplete evidence on all three broad positive questions.

## Change

- Bind call citations to the unique named function or method. Walk through
  local variable declarations to their enclosing callable; nested functions
  remain separate callers. Resolve imported call aliases using static edges.
- Distinguish a spelled member invocation from its implementation. Requests
  for the implementation need a static callee link; unresolved provider
  methods cannot establish it.
- Pair a setting in a top-level `const` object initializer with a property
  read resolving to the same declaration. Check the requested use owner and
  provider when named. Reject shadowed imports, spreads and duplicate keys.
- Supply alternative citation sets to H and check selected sets afterward.
  Missing relationships require `needs_review`; checked partial citations
  remain available for parent review.
- Grade required-line coverage, supported positive status, frozen distractor
  citations and abstention separately. Record implementation hashes, including
  new untracked modules, alongside fixture and source identities.

Implementation: `src/experimental/tools/local-explore-relationships.ts`.
These are bounded source checks, not runtime or general semantic verification.
They recognize explicit named requests; natural behavior questions still use
the earlier heuristics. Member injection, factories, re-export chains and
mutable runtime configuration are not resolved. An initializer/use pair proves
the declaration binding, not an effective runtime value. Target sources remain
read-only; feature gating, character/output budgets and two-call limit remain.

## Independent real-source screen

A fresh-context read-only agent authored the questions without access to scout
implementation. The lead checked exact source lines and froze the
[fixture](2026-10-06-h-real-source-queries.json) before the first model call.
The snapshot contains six connected TypeScript files from another application,
including decorators, injected services and competing executable call sites.
No env files or literal credentials were copied. Snapshot source stays ignored.

This is a source-slice screen, not whole-repository held-out accuracy. Required
lines form a minimum evidence screen, not a full answer rubric. For example,
the creation question's six required lines do not separately score image-ID
storage. There was no pre-change real-source baseline. No implementation or
prompt tuning followed the first evaluation call, and there were no external
reruns. The scout's own bounded retry remains part of the route.

| Case | Required supplied | Required selected | Result | Seconds |
|---|---:|---:|---|---:|
| Image creation/validation/upload/storage | 3/6 | 1/6 | Incomplete, `evidence_selected` | 24.6 |
| Query transformation/filter/pagination | 5/6 | 3/6 | Incomplete, `needs_review` | 17.7 |
| Image replacement/failure cleanup | 4/6 | 3/6 | Incomplete, `evidence_selected` | 15.4 |
| Absent deletion by named soft-delete caller | — | — | Appropriate `needs_review` | 24.0 |
| Absent upload by named soft-delete caller | — | — | Appropriate `needs_review`, distractor retained | 33.1 |
| Runtime configuration provenance | — | — | Ambiguous; no gold status | 49.4 |

Complete positive evidence: **0/3**. Appropriate negative status: **2/2**.
The second negative retains an upload citation from a different method; safe
status does not imply relevant selection. The creation answer selects imports
and the interceptor but omits validation, upload and storage evidence. The
replacement answer selects update and cleanup lines but omits the initial
upload and database-failure cleanup. Retrieval windows and selection both fail.

The ambiguous question selects environment reads and configuration/upload
source. Those lines identify the environment variable names; they do not show
how the runtime environment is populated. It is excluded from negative scores.

## Regression and verification

The earlier synthetic screen remains **2/2 complete positives**, **2/2 appropriate
negative statuses**. Invoice and parcel chains take 7.2s and 6.6s; absent calls
take 11.8s and 12.2s. This is regression evidence, not new held-out quality.

- All returned quotes match source. All 16 generation calls stop naturally.
  H inherits saved 50000 context and the 2048 scout output reserve, with
  `think:false` and the ordinary 120-second per-call deadline.
- All 96 loaded-model placement samples show 100% GPU. These short selections
  do not establish sustained long-output fidelity or a speedup.
- Pass: 28 scout/relationship, 17 model-budget/tokenizer, 3 feature,
  8 Quality Review and 2 grader CLI tests (**58 total**).
- TypeScript passes for source and changed benchmark CLIs/tests with only the
  existing missing-`vitest` experimental test excluded. Standard TypeScript
  checking still encounters that pre-existing missing dependency.
- Fixture, source and implementation hashes agree across both completed
  stages. The shared supervisor lock is released; H is unloaded.
- Ignored artifacts: `benchmark-data/h-relationships/` contains the source
  snapshot, implementation copies, raw requests/results, separate v3 grades,
  placement samples, test log and supervisor state/log. Previous artifacts
  remain unchanged.

## Next checkpoint

Prioritize evidence completeness for natural behavior questions before more
context/output tuning. Separate semantic question parts, preserve the relevant
windows within large methods, and require review when completeness cannot be
established. The two incomplete `evidence_selected` positives are an open
contract gap. Use this screen as development evidence from now on; freeze new
independently authored real-source questions before validating that change.

Do not claim broader H reliability from the synthetic pass or safe negative
statuses. General semantic provenance, parent review effort and sustained
GPU-only long-output fidelity remain unmeasured.
