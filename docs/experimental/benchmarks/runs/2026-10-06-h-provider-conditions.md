# H provider discovery and image conditions — 2026-10-06

The upload adapter now reaches the previously failing development question:
required source coverage rises from 5/11 to 11/11 and selection from 2/11 to
10/11. Fresh questions still expose incomplete selection and a negated-operation
packing gap. Natural evidence remains subject to parent review.

## Change

- For operation plans, search unresolved root-relative `src/` import paths
  against indexed files and unresolved operation calls against local method
  names. Keep competing methods as candidate context, without resolving aliases,
  injected providers or runtime calls. Existing static relationships are unchanged.
- Retain two expansion hops, six files per part, the 24000-character cap and
  two generation calls. Cache source reads within expansion. Indexed paths still
  pass the existing repository-boundary check; tests and benchmarks stay excluded.
- Add image checklists for record lookup, missing-record rejection, optional-file
  guards, conditional image fields, missing-image rejection and upload-result
  validation. These patterns guide packing and selection; they do not bind every
  condition to the requested method or prove all branches.
- Preserve the unchecked-completeness review requirement. Add three regressions
  for unresolved paths, competing providers and explicit conditions. Keep them in
  a separate small test module: appending them to the existing repository test
  caused an indexing parse failure, which disappeared after the split.

No model defaults, deadlines, feature gates or target sources were changed.

## Development and regression

The previous [follow-up screen](2026-10-06-h-multistep-evidence.md) is development
evidence. Its original questions, rubric and artifacts remain unchanged.

| Case | Required supplied | Required selected | Status | Seconds |
|---|---:|---:|---|---:|
| Existing-image replacement/failure paths | 13/13 | 11/13 | `needs_review` | 115.2 |
| Missing image/upload failure/temp cleanup | 11/11 | 10/11 | `needs_review` | 114.3 |

Complete exact-rubric positives: **0/2**. The first selection omits the method
declaration and optional-file guard; the second omits the creation method
declaration. Provider discovery fixes the earlier missing-adapter problem, but
complete packing does not establish complete selection or a complete answer.
The new guards still need method-specific selection and checking.

The synthetic caller/provider regression retains **2/2 complete supported
positives** and **2/2 appropriate negative statuses**. Times are 8.9s, 8.8s,
17.5s and 15.4s. These are regression cases, not fresh quality measurements.

## Frozen independent follow-up

A fresh-context read-only Luna review authored questions from the same six-file
source slice without access to implementation or earlier screens. Its first
broad suggestions overlapped earlier tasks, so the brief was narrowed to provider
deletion statuses, update without a file and suppressed temporary-file failure.
The lead checked source and removed brace-only/unselectable rubric lines, adding
the uploaded declaration and conditional image mapping lines before freezing.
Question wording was unchanged. The
[fixture](2026-10-06-h-provider-condition-queries.json), source hashes and
implementation were frozen before model calls. No tuning or external rerun
followed validation; the scout's own bounded retry is part of the route.

| Case | Required supplied | Required selected | Status | Seconds |
|---|---:|---:|---|---:|
| Provider deletion options/results/errors | 9/9 | 8/9 | `needs_review` | 57.8 |
| Update without replacement file | 14/15 | 5/15 | `needs_review` | 51.3 |
| Suppressed temporary-file cleanup failure | 13/13 | 11/13 | `needs_review` | 47.1 |

Complete exact-rubric positives: **0/2**. Safe negative status: **1/1**.
This is new wording on overlapping source, not unseen-repository accuracy.
Required lines are a minimum source screen, not a full answer or absence rubric.

The deletion selection contains the options, accepted statuses and error branches,
but omits the method declaration. Planning also treats “calls Cloudinary” as a
literal named-callee request and reports a missing `Cloudinary call`.

The absent-file question triggers replacement checks despite “without.” Its
conditional empty-object spread is not packed, and selection misses the requested
missing-record guard and persistence branch. This separates a planning/window gap
from additional selection failures. The cleanup negative selects the helper's
catch/comment but misses upload-error passthrough lines and retains one frozen
distractor: a deletion-error throw. Review status does not establish relevant
selection or a complete negative answer. Parent inspection confirms the cleanup
helper suppresses unlink errors; upload errors are surfaced separately.

## Verification and next checkpoint

- Pass: 38 scout/relationship/operation, 17 model-budget/tokenizer, 3 feature,
  8 Quality Review and 2 grader tests (**68 total**); whitespace checks pass.
- Standard TypeScript checking still reports the existing missing `vitest`
  dependency. Source and benchmark CLIs/tests pass with only that existing test
  excluded by the archived temporary config.
- All 16 generation calls stop naturally; all selected quotes match source.
  H inherits 50000 context, the 2048 scout reserve, `think:false` and the normal
  120-second per-call deadline. Effective daemon settings are q4_0 KV, Flash
  Attention enabled and one slot.
- All 212 loaded-model placement samples show 18% CPU / 82% GPU. This run is
  not GPU-only performance or sustained-output evidence. The follow-up journal
  inspection below identifies the allocator's reason; timings do not establish
  a speedup.
- Ignored `benchmark-data/h-provider-conditions/` preserves raw requests/results,
  separate grades, source/fixture identities, implementation copies/hashes,
  placement, daemon settings, verification summary and supervisor state/log.
  Every stage matches the implementation freeze. All artifacts are complete,
  the shared lock is released and H is unloaded.

### Placement follow-up

The 21:26 load projected 3300 MiB of GPU use against 4865 MiB available,
with a 1685 MiB free-memory target. It missed that target by 120 MiB and,
because context was explicitly set to 50000, reduced GPU placement to
32/34 layers. The fit kept approximately 1689 MiB free. Its estimates include
the 986.67 MiB worst-case vision-projector allowance even on text requests.
The excerpt is archived as `placement-diagnosis-journal.txt`.

Current desktop usage after unloading H is 757 MiB, including Xorg, GNOME
and graphical applications. That observation cannot identify the particular
process responsible at load time. Earlier clean 50K loads succeeded with more
available VRAM; 50K is therefore workload-sensitive, not inherently CPU-only.
Effective q4_0 KV, Flash Attention and one-slot settings remain correct.

For GPU-only work under the current desktop load, test lower per-request
context, starting at 32768, or free additional VRAM before reloading. This is
a proposed placement check, not a verified new default. The saved 50K model
setting is unchanged. Lowering only the output ceiling does not reduce the
already allocated context or move a resident mixed runner back onto GPU.

Next: recognize negated operation requests and provider-name phrasing, preserve
the relevant condition and fallback windows, and bind condition/error citations
to the requested method. Keep this screen as development evidence and freeze
new questions for validation. Broader H reliability, parent review effort,
representative caller calibration and GPU-only long-output fidelity remain
unmeasured. I comparisons remain paused.

The subsequent H-only implementation and development regression are recorded in
[the operation-scoping checkpoint](2026-10-06-h-operation-scoping.md). This report
and its original frozen follow-up remain unchanged evidence for the earlier route.
