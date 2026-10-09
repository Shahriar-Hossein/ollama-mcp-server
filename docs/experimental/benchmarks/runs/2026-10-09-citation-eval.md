# Frozen Python citation review fixture

Six static known-claim cases and two fresh model questions are frozen in
[the manifest](2026-10-09-citation-eval.json). The source is a sixteen-line
Python file with a module dictionary, a shadowing local dictionary, and an
async callable reading the module dictionary. Existing evaluations are untouched.

This fixture measures lexical review cues, not semantic claim classification.
The manifest's claim truth is independent manual source review. BAD-BINDING and
BAD-RETURN are false claims with foreign citations. CLEAN-CONTRAST is a true
claim with foreign citations. CLEAN-MODULE is true with unresolved module-owner
refs. UNKNOWN cannot be answered from this source: its caller setting is an
unresolved semantic requirement, with no citations to classify.

For this frozen source, lines 7–12 belong to process_inline; lines 15–16 belong
to process_background. Headers belong to their own declaration for this rubric.
This differs from supporting_context's null owner for selected headers. Module
lines have no callable owner. Foreign ownership calls for review; it does not
prove a false claim. Absence of a flag does not prove binding or correctness.

Question query text is separate from gold answers, required refs and forbidden
claims. Model runs must send only queries and source evidence, never golden
fields or static case claims. The baseline model run and independent source audit are recorded below.

The local H draft took 20,730 ms and supplied the requested six IDs, schema,
shadowing, async function and scalar returns. It missed multiline dictionaries,
used placeholder claims with all truth labels unknown, omitted citation
indentation and left duplicate return text ambiguous. Sol repaired source and
manually checked line-specific references and independent claim truth.

Validation:

- `node --import tsx --test scripts/experimental/citation-eval-fixture.test.ts`
- `node --import tsx scripts/experimental/citation-eval-fixture.ts`

The validator freezes exact source files and hashes, validates line text and
safe paths, enforces unique citation locations and case/question IDs, checks
header targets, and checks the fixed lexical rubric. It is intentionally limited
to this source; it does not parse arbitrary Python or resolve bindings.

## Pure foreign-owner helper

The local H task supplied only a function body against an exact typed signature
and a `body: string` response schema. Its body was applied without logic changes and passed
three focused tests plus strict script typechecking. Tool elapsed time
was 12,869 ms (about 13 seconds); this does not establish quota or cost savings.

`foreignOwnerCitations` assumes validated, unambiguous owner records. It compares
owner file and declaration line, skips null owners, deduplicates foreign citation
locations in first-seen order, and returns copied locations. A null target yields
an empty result. An empty result is no foreign-owner cue, never a semantic pass;
module ownership and missing target resolution require separate review.

## Checked Python source adapter

The H adapter draft took 29,029 ms of tool elapsed time and failed source
inspection. It was never executed. Parser imports/API, checked reads, cache
population, source accounting, quote validation and scope coordinates were
incorrect. Sol implemented the bounded adapter and source validation.

`pythonCitationOwners` accepts complete source-line quotes modulo leading/trailing whitespace, checks containment
before reading, and parses pinned Python grammar through the shared parse helper.
Original source indentation supplies AST coordinates; partial or changed text is rejected.
Each request allows at most 96 positions, six unique Python files and 24,000
unique source characters. The review target counts toward the position cap.
Overflow or invalid evidence throws; evidence is never silently discarded.
Caches live only within one request.

Function declaration headers own themselves. Other lines use the nearest lexical
function ancestor at the first non-whitespace source column. Class and lambda
scopes block attribution to outer functions. Multiple scopes starting on one
physical row, malformed files and module lines have unknown owners. These are
lexical source coordinates, not binding, import, runtime or claim resolution.

`reviewPythonCitations` takes an explicit checked target source line. Only a
function header owning itself resolves the target; body lines and natural-language
names cannot select it. It always returns `needs_review`, with copied owner
records, foreign-owner cues, unresolved citations and applicable reasons. Missing
targets leave all citations unresolved; no citations produces `no_citations`.
The wrapper does not score answer correctness or classify claim truth.

All six static cases are tested against their independently frozen foreign and
unresolved refs, including the true contrast claim. Additional tests cover nested
functions, scope barriers, malformed/ambiguous scopes, target validation, paths,
exact quotes, bounds, duplicate refs and fresh reads after source edits.

## Baseline runner and posthoc ownership artifact

`node --import tsx scripts/experimental/run-citation-eval.ts` reuses the language
evaluation runner with a pinned citation descriptor and `selected_only` answer
context. Default output is the ignored
`benchmark-data/language-eval/citation-development/model-run.json`; `--model`,
`--only` and `--output` retain the existing argument contract. The H descriptor
fragment supplied correct paths/hash in 14,872 ms of tool elapsed time, but missed
the explicitly requested validator type cast. Sol repaired that callback.

Only source files enter the temporary Git target. Queries and selected evidence
enter model prompts; static claims, owner rubrics, explicit target locations and
answer keys do not. Target locations come from the frozen manifest after generation.

The raw result is saved unchanged. Its sibling `${output}.owners.json` pins the
raw SHA-256, frozen manifest/source hashes and evaluated implementation hashes.
Source and manifest are checked again before analysis. All six static cases keep
independent claim truth and compare the frozen foreign/unresolved references.
Model claim locations must match selected, source-validated evidence; those quotes
are materialized from source before lexical review. Invalid or unselected refs,
malformed answers and absent answers remain `not_checked`; an empty citation list
retains `no_citations` with `needs_review`. Raw malformed output is preserved.

Both artifacts retain pending manual review with correctness and correction metrics
null. A checked ownership record describes lexical comparison only, never semantic
support or answer correctness. Output checks protect source/manifest paths from
raw and sibling writes, including existing symlink aliases. The model result is
separate from these implementation checks.

## Frozen baseline result and independent source audit

Command: `node --import tsx scripts/experimental/run-citation-eval.ts --model qwen-context:h-q4_0-24k`.
Implementation `be8a1e4`; source/manifest freeze `fc76f1f`. Saved context is
24,576; scout output reserve 2,048 and answer limit 512. One frozen run, no parent
model rerun. Raw and owner artifacts remain unchanged; independent review and
checked full answers are in ignored `model-run.review.json` beside them.

| Question | Required | Retrieved range | Packed initial/any | Selected | Source audit |
| --- | ---: | ---: | ---: | ---: | --- |
| PY-INLINE | 5 | 5 | 5/5 | 5 | Complete local inline/4 answer; key/value wording mildly imprecise |
| PY-BACKGROUND | 5 | 2 | 5/5 | 2 | Incomplete; module batch/11 declaration/values omitted from selection |

Stage intervals in milliseconds (not isolated model time):

| Question | Index | Retrieval | Packing | Scout queue/request wall | Answer queue/request wall |
| --- | ---: | ---: | ---: | ---: | ---: |
| PY-INLINE | 22 | 8 | 3 | 19,826 | 7,042 |
| PY-BACKGROUND | 17 | 0 | 1 | 13,389 | 6,819 |

These stage intervals exclude run-level setup: fixture validation 1 ms, source/Git
materialization 17 ms, target validation 3 ms and model settings 21 ms. Request
wall intervals include local queue wait and API work. Question end-to-end intervals
include in-question tools and observer/checkpoint overhead, not that run-level setup.
The stages are not a complete additive breakdown or isolated inference latency.

All selected quotes and claim citation locations match source. Inline's four
claims are source-correct in answer context. Background's dictionary-read claim
is true but cites only its header; its return claim and main answer end at
`OPTIONS[` and cannot express a complete claim. Its mode-read claim is true.
Its attempts abstention accurately describes the selected evidence, not the full
source, and is not counted as an incorrect source claim. Across eight structured
claims, seven are source-correct or qualified (including imprecise wording and the
evidence-limited abstention), one is unassessable because incomplete, and zero are
independently known false structured claims. This is not an overall zero-wrong-claims
result: the separate scout text
incorrectly says no OPTIONS read/constant return; line 16 contradicts it.

Both questions had two scout attempts (one retry), one bounded source expansion,
one answer call and zero answer retries. All six generation completions have
`done_reason: stop`; neither semantic truncation nor valid JSON establishes a
length stop or timeout. End-to-end question intervals were 27,433 and 20,249 ms,
including tools and orchestration. One source-corrected answer is needed: background
reads module OPTIONS and returns batch; its dictionary attempts value is 11.
Inline needs no answer correction. Exact checked citations and all eight individual
claim classifications are preserved in the review artifact.

No real claim has a foreign-owner cue, yet background is incomplete. The six
static cases flag both known wrong claims and the true contrast; module refs
remain unresolved and UNKNOWN has no evidence. Owner comparison is a review cue,
not a truth/completeness classifier.

Measured intervals are agent wall time, never human effort or isolated reasoning:

- Root initial structured-answer/source review: 16:53:52.757–16:54:29.448 UTC,
  36,691 ms, source already known. This excludes later scout/report verification;
  per-case and full-workflow effort remain unmeasured.
- Independent Sol audit: 16:55:20.904–16:56:13.556 UTC, 52,652 ms; includes tools,
  truncated output/reread and trailing-newline verification retry.
- Sol correction drafting: 16:56:21.658–16:57:02.593 UTC, 40,935 ms, separately
  bracketed before writing full answers and checked citations.

Per-case parent-review/correction times remain null; global intervals are not
divided between cases. Four local H development tasks preceded Sol fallback:
fixture useful but incomplete, pure typed helper passed, broader supplied-interface
adapter failed, and the smaller descriptor omitted an explicitly requested cast.
This supports smaller typed tasks with executable gates, not promotion or savings.

Artifact SHA-256:

- Raw: `d39f676a57e5d5155237e4d979f94b096591656669a0348b53647cdf89f946d3`
- Owners: `11737da1ef7a571b858372cbe6e66d414c2e32e098fb5b7f9a16f8c051532cad`
- Review: `9e29bbd5022070b017e47e8d8f625ba6e784e9ab3116e6d36b5b5fc9ff4e847a`

Original multilingual and scope manifests/raw artifacts were hash-checked unchanged.
The 26 focused named tests and typechecks passed before this documentation-only
step. Next: develop explicit retention of named module dictionary declarations
and scalar values in Python selected context; separately bound incomplete-string
checks, then freeze fresh questions. Do not tune this screen or infer imports.
