# H ordinary multi-step evidence — 2026-10-06

Natural image-workflow and query/list questions now have explicit operation
checklists and separate source windows. Empty checklists and unchecked semantic
completeness require `needs_review`. This makes partial selections safer;
checklist coverage does not prove completeness across providers or branches.

## Change

- Share repeated operation parts across dependent clauses while retaining the
  full question. Separate acceptance, validation, upload, URL/ID storage, replacement, failure
  cleanup, temporary-file cleanup, transformation, filtering, pagination and
  response evidence when those operations are recognized.
- Reserve up to six windows per source around checklist matches, including
  other operations in a file retrieved through an inner variable. Merge shared
  lines under the existing 24000-character cap and six-file/part budgets.
- Include request dispatch and service upload hints for relevant questions.
  Keep interface/type declarations out of natural operation shortlists.
- Allow sixteen refs per part, at most 96 total. Keep H's saved 50000 context,
  default 2048 scout output reserve and two-call limit.
- Limit broader windows to natural plans so legacy registration queries stay
  within budget. Named-call requests with additional unchecked behavior also
  require review. Return missing requirements per part. Natural plans are explicitly unchecked;
  unknown questions cannot pass by satisfying an empty checklist. Keep checked
  partial evidence for parent review.

Operation recognition and executable-line matching are bounded heuristics,
including image-specific storage patterns. They do not exhaustively interpret
natural language, prove all failure branches or resolve injected providers.
Recognized legacy bounded checks remain heuristics. Target source stays read-only,
experimental registration remains opt-in, and I comparisons remain paused.

## Development evidence

The previous [real-source screen](2026-10-06-h-relationships.md) is development
evidence from this change onward. Its original artifacts are unchanged.

| Positive | Required supplied | Required selected | Status | Seconds |
|---|---:|---:|---|---:|
| Image acceptance/validation/upload/storage | 6/6 | 6/6 | `needs_review` | 120.3 |
| Query transformation/filter/pagination | 6/6 | 5/6 | `needs_review` | 38.7 |
| Image replacement/failure cleanup | 6/6 | 6/6 | `needs_review` | 83.8 |

Complete minimum evidence is **2/3**, compared with the historical **0/3**.
The list misses the supplied controller dispatch line. Both complete natural
selections still require review. The original minimum rubric does not separately
score image-ID storage or every failure branch, so this is not general semantic
completeness. Larger bundles and broader selection take longer; no speedup or
parent-effort reduction is established.

An initial development pass found that a tiny inner-variable retrieval could
suppress other windows in the same file. Its creation result supplied and selected
4/6 required lines; the final same-file expansion supplies all six. Both passes
are archived separately. The synthetic caller/provider regression remains
**2/2 complete supported positives** and **2/2 appropriate negative statuses**.

## Independent validation

Two fresh-context agents authored questions from the same six-file source slice,
without access to implementation or previous questions/results. Exact lines and
source hashes were checked. Question wording was unchanged during pre-call
rubric audits, whose removed entries remain archived. The lead reviewed each
screen after freezing its implementation. These are new questions on overlapping
source, not unseen-repository accuracy. Each screen ran once with H's internal
bounded retry; neither was externally rerun for a better score.

The [first frozen screen](2026-10-06-h-multistep-queries.json) exposed duplicate
operation parts across dependent clauses. It becomes development evidence after
that finding; its artifacts and implementation remain under `fresh-v1/`.

| Case | Required supplied | Required selected | Status | Seconds |
|---|---:|---:|---|---:|
| Creation/database failure | 10/10 | 9/10 | `needs_review` | 104.5 |
| Multipart/upload/temp lifecycle | 23/28 | 0/28 | `input_overflow`, seven parts | 0.1 |
| List branch behavior | 18/18 | 10/18 | `needs_review` | 88.4 |
| Missing restoration after update failure | — | — | `needs_review` | 32.0 |
| Missing rollback after removal failure | — | — | `needs_review` | 55.3 |

Complete exact-rubric positives: **0/3**. Safe negative statuses: **2/2**.
The negatives retain four and three frozen forbidden citations. Some describe
actual deletion/cleanup in the requested path, so these frozen counts alone do
not establish semantic irrelevance. Safe status does not establish a complete
negative answer. Creation omits the DTO spread required by the exact rubric;
list selection misses branch conditions and database work.

After merging duplicate operation parts, a deterministic replay of the overflow
case reaches generation with five parts and unchanged budgets. Its output is
stubbed, so the replay establishes packing/budget behavior, not H quality.
A repository regression also caught expanded windows leaking into legacy packing;
those windows now apply only to natural plans.

The final correction was validated on a
[new independently frozen follow-up](2026-10-06-h-multistep-followup-queries.json).
No implementation or prompt changes followed its model calls.

| Case | Required supplied | Required selected | Status | Seconds |
|---|---:|---:|---|---:|
| Existing-image replacement and two failure paths | 13/13 | 10/13 | `needs_review` | 102.9 |
| Missing-image and remote-upload failure paths | 5/11 | 2/11 | `needs_review` | 95.9 |

Complete exact-rubric positives: **0/2**. Replacement selection omits the existing
record lookup and optional-file guard. The second question's bundles omit the
upload adapter entirely; only two selected lines pass its rubric. In this slice,
its provider import is a root-relative `src/...` specifier without supplied alias
configuration. Lexical selection and supported static expansion do not bring the
provider into context. Operation checklists do not guarantee file discovery or
cover every requested condition. Full ordinary-question completeness remains
unresolved; safe review status is a separate gain.

The final caller/provider regression still has **2/2 complete supported positives**
and **2/2 appropriate negative statuses** (7.9s, 7.7s, 15.6s, 15.0s).

## Verification and checkpoint

- Pass: 35 scout/relationship tests and 30 feature, Quality Review,
  model-budget/tokenizer and grader tests (**65 total**).
- Source and changed benchmark CLIs/tests pass TypeScript with the existing
  missing-vitest experimental test excluded. Standard `npx tsc --noEmit` still
  reports that pre-existing missing dependency.
- Artifacts: ignored `benchmark-data/h-multistep/` preserves raw requests,
  outputs, metrics, scores, placement samples, implementation freeze/copies,
  rubric audit, supervisor logs/state and tests. Source/fixture/implementation
  identities match. All ten final generation calls stop naturally and returned
  quotes match source. The lock is released and H is unloaded.
- Initial development, final pre-correction development and the first validation
  have 184, 138 and 137 loaded-model samples, all 100% GPU. The final follow-up
  and regression have 119 samples at 16% CPU / 84% GPU. The placement change
  has no established cause here; their timings are not an equivalent-run
  comparison or GPU-only fidelity evidence.
- Initial development artifacts
  are under `development-v1/`; final development artifacts are separate.

Next: improve operation-driven provider discovery and explicit condition/branch
requirements, then freeze new independently authored questions. Distinguish file
discovery, window coverage and selection failures. Do not promote H to reliable
ordinary-question delegation from safe statuses or the development pass. Caller-input
calibration and sustained GPU-only long-output fidelity follow that work; I
comparisons stay paused.
