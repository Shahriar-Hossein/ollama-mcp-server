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
fields or static case claims. No model runs or accuracy results are recorded here.

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
