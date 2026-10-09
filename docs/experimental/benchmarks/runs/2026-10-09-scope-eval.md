# PHP/Python scope evaluation — 2026-10-09

No improvement is established by this four-case pair. Both H runs supplied and
selected all 20 required references; one false structured claim remains in each
run, concerning different relationships. The optional lexical answer harness
combines annotations and a clarification instruction, so this comparison cannot
isolate either effect or establish general reliability or review savings.

## Comparison

Both runs have 20 required references, 17 within retrieved symbol ranges, 20
initially packed, 20 packed across attempts and 20 selected. Exact selected tuples
match for all four cases: 8, 10, 5 and 10 lines respectively, including extras.
All four scout results remain `needs_review`; all twelve calls in each run stop
normally. Location validation reports zero errors, which does not prove claims.

| Observation | Selected-only baseline | Lexical context |
|---|---:|---:|
| Scout / answer calls | 8 / 4 | 8 / 4 |
| Scout retries / expansions | 4 / 4 | 4 / 4 |
| False structured claims, source audit | 1 | 1 |
| Summed case end-to-end ms | 107718 | 122054 |
| Answer queue/API wall ms | 29178 | 36441 |
| Index / retrieval / packing ms | 76 / 11 / 28 | 80 / 9 / 31 |
| Native Ollama total duration ms | 106829.51165 | 121144.758974 |

Elapsed time is higher in the context run. Wall times include queue/API waits;
summed case end-to-end includes per-case setup and observer/checkpoint overhead.
Global fixture/model/materialization setup is recorded separately. Native Ollama totals sum
all twelve calls' reported `total_duration`, not pure generation time. These two
runs support no causal speed or review-cost conclusion.

The baseline's PY-S1 calls dictionary initializer line 8 the enclosing declaration,
despite selecting function header line 7. Its local/2 values are correct; binding
and returned-mode claims cite only value line 9. Baseline PHP-S2's true array-span
assertion includes closing line 14 absent from its selected/cited lines 11–13.

The context run corrects PY-S1's enclosing-header claim, but PY-S2 falsely
attributes `execute_async` to the local `DEFAULTS` in `execute` at lines 8–10,
while reporting the correct shared/9 values. Source correction uses module lines
1–3, header 15 and return 16. Two other interventions are distinct: PY-S1's
narrative makes the dictionary the subject of “returns” and needs a wording repair;
PHP-S2's true returned-mode claim cites value 12 alone and needs return 15 too.
These are three interventions, not three incorrect answers. PHP-S1 agrees with
source; claim truth, citation support and wording are assessed separately.

The lead's 46,086 ms baseline interval mixes inspection and harness planning;
its pure review component cannot be separated. The independent context audit
measured 8,000 ms at one-second clock resolution. Both are agent wall proxies,
not human effort or savings, and are not comparable review measurements. Full
correction time and per-case intervals remain null because instrumentation missed
drafting. Raw manual-review fields remain pending; audits and corrections are
separate sidecars.

## Fixture, harness and provenance

[The frozen manifest](2026-10-09-scope-eval.json) contains two PHP and two Python
questions with exact complete-line references and forbidden cross-scope claims.
Python contrasts local `DEFAULTS` in `execute` with module `DEFAULTS` read by
`execute_async`; PHP contrasts neighboring local `$options` arrays. Sources and
keys were frozen before generation. Original multilingual fixture sources,
manifest and results were unchanged and were not rerun.

`node --import tsx scripts/experimental/run-scope-eval.ts` runs the baseline.
`--scope-context` opts into the lexical harness and a separate default artifact.
Each selected line gets the first applicable PHP/Python enclosing header from the
existing structural helper, with checked source quotes. Null means not provided,
not module scope. Labels do not resolve bindings or prove entailment; citations
remain limited to selected locations. Metadata enters input budgeting and is
persisted with requests/raw outputs/completions. Annotation work enters answer
end-to-end timing. Default source APIs, registrations, read-only access and the
six-file/24,000-character packing bounds remain unchanged.

Ignored artifacts under `benchmark-data/language-eval/scope-development/`:
`baseline.json`, `scope-context.json`, `baseline-summary.json`,
`scope-context-summary.json`, `baseline-audit.json` and `scope-context-audit.json`.
Raw artifacts were preserved and each audit pins its raw hash.

- Fixture freeze commit: `d340709`
- Manifest SHA-256: `f413e08dbc6ac75ee324ddcfd3f59a54085a7f229d4d1bb5aa811ea4a6adcd0f`
- Baseline SHA-256: `2ccc6d04b9ebdd1f4bc291586a01256db16e37ae9a6285bb36bc03701b3d2e52`
- Context SHA-256: `e8bef37fe4d60c43db8a026c9d0a1b3632b249cffbfa8276d16e3d6cca8f0a53`

Three H coding drafts failed review: fixture (26,001 ms), runner (21,070 ms) and
helper (18,149 ms). Sol completed the scoped fallbacks. The final H report draft
(11,546 ms) needed wording repairs: higher elapsed time is not increased
performance, and a single pair establishes no improvement rather than proving
no net improvement or superiority. These observations establish no general
model reliability conclusion. Twenty-six named tests, strict standalone script
typecheck and project typecheck passed before this documentation-only report.

Next: a fresh bounded Python cross-scope citation check should flag inconsistent
lexical owners while leaving binding targets unresolved. Test known-bad and clean
examples before routing. Start review/correction clocks before inspection and
drafting. PHP aliases/includes and Python package imports remain future bounded
work; working-tree cache invalidation and aggregate checks remain pending.
