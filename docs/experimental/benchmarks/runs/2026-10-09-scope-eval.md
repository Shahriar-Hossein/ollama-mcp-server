# PHP/Python scope fixture — 2026-10-09

Four independent questions isolate repeated keys in neighboring declarations.
Python contrasts a local `DEFAULTS` shadow in `execute` with module `DEFAULTS`
read by `execute_async`. PHP contrasts two local `$options` arrays. Each answer
must preserve the mode/retries pair and cite its declaration, value source and
return. Forbidden claims reject values borrowed from the other scope.

The two source files and exact complete-line rubric are frozen in
[the manifest](2026-10-09-scope-eval.json) before answer generation. This is a
fresh fixture; the original language fixture, manifest and runner are unchanged.
Validate with `node --import tsx scripts/experimental/scope-eval-fixture.ts`;
run focused tests with
`node --import tsx --test scripts/experimental/scope-eval-fixture.test.ts`.

H's fixture draft took 26,001 ms. It missed the actual `DEFAULTS` shadow,
async declaration and scalar return; PHP entries spanned multiple lines.
A scoped Sol fallback corrected the two files and independently checked the
four answers against their source. No answers have been generated or scored;
fixture preparation supports no accuracy conclusion.

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
tests. This is runner validation, with no model accuracy result.
