# PHP/Python scope fixture — 2026-10-09

Four independent questions isolate repeated keys in neighboring declarations.
Python contrasts a local `DEFAULTS` shadow in `execute` with module `DEFAULTS`
read by `execute_async`. PHP contrasts two local `$options` arrays. Each answer
must preserve the mode/retries pair and cite its declaration, value source and
return. Forbidden claims reject values borrowed from the other scope.

The two source files and exact complete-line rubric are frozen in
[the manifest](2026-10-09-scope-eval.json) before answer generation. This is a
fresh fixture; the original language fixture sources and manifest are unchanged.
Validate with `node --import tsx scripts/experimental/scope-eval-fixture.ts`;
run focused tests with
`node --import tsx --test scripts/experimental/scope-eval-fixture.test.ts`.

H's fixture draft took 26,001 ms. It missed the actual `DEFAULTS` shadow,
async declaration and scalar return; PHP entries spanned multiple lines.
A scoped Sol fallback corrected the two files and independently checked the
four answers against their source. Fixture preparation alone supports no
accuracy conclusion.

Run the selected-evidence baseline with
`node --import tsx scripts/experimental/run-scope-eval.ts`. Its default artifact is
ignored `benchmark-data/language-eval/scope-development/baseline.json`. The wrapper
pins the manifest SHA-256 and reuses the existing runner. It records validator,
wrapper and source hashes plus the fixture freeze commit. Only source files enter
the temporary Git target; answer keys remain outside model prompts. Manifest,
source and target checks precede every generation, including scout retries and
final-answer budget setup. Final answers receive selected evidence only.

H's runner draft took 21,070 ms and was not executed: it reassigned constants,
called the validator with the wrong arguments, lost types and omitted retry
checks. The scoped Sol fallback added the descriptor, wrapper and mock runner
tests. These checks validate the runner rather than model answer quality.

## Selected-evidence baseline

The completed raw baseline is ignored
`benchmark-data/language-eval/scope-development/baseline.json`, SHA-256
`2ccc6d04b9ebdd1f4bc291586a01256db16e37ae9a6285bb36bc03701b3d2e52`.
Its pinned independent source audit is `baseline-audit.json` in the same directory;
the raw answers were preserved.

All 20 required references were initially packed, packed across attempts and
selected; 17 appeared in retrieved symbol ranges. The run used eight scout calls,
four answer calls, four retries and four expansions, with 107,718 ms summed case
end-to-end time. All four scout results remain `needs_review`.

PY-S1 incorrectly calls the dictionary initializer on line 8 the enclosing
declaration, despite selecting the actual `execute` header on line 7. Its
local mode/retries pair is correct, but binding and returned-mode claims cite
only the value line 9. The other three answers agree with source. PHP-S2's array
span assertion includes closing line 14, which its selected/cited lines 11–13
omit. Claim truth, citation locations and citation entailment remain separate.
The lead's dedicated 46,086 ms audit interval is an agent wall-time proxy,
not human review time, per-case timing or measured savings.

## Optional lexical answer context

`--scope-context` opts the scope wrapper into lexical annotations and defaults to
ignored `scope-context.json` in the same directory. Baseline mode remains the
default; the original language evaluation CLI remains unchanged. Each selected
line independently receives the first matching PHP/Python enclosing header from
the existing structural helper. Individual calls retain headers even when they
were already selected elsewhere. Checked source quotes are copied; a missing
header means not provided, including selected header lines, and never proves
module scope. These labels do not resolve bindings or prove claim entailment.

Only selected locations remain eligible for answer citations. The annotations
and request are persisted and included in input budgeting. Annotation work is
included in answer end-to-end time. Existing retrieval/packing/selection metrics
are unchanged. Baseline `supporting_context` arrays were empty because the applicable header and sibling extras for selected lines
were already selected; that did not prevent PY-S1's error.

H's helper draft took 18,149 ms and was inspected but not executed. It used a
nonexistent evidence shape, accepted foreign Python headers through operator
precedence, sorted outer headers first and omitted line validation and copying.
The scoped Sol fallback added bounded harness annotations and tests. No paired
rerun has completed, so no fix or accuracy improvement is claimed. The optional
harness combines labels with a clarification instruction; a single paired run
cannot isolate their effects or establish general reliability.
