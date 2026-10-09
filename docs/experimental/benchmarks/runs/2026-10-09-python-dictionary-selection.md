# Python dictionary selection checkpoint — 2026-10-09

First bounded piece: a pure explicit-question recognizer in
`local-explore-python-dictionary.ts`. It accepts exactly one unquoted
`Which NAME dictionary does FUNCTION read` phrase with ASCII identifiers.
It preserves name case and rejects qualified, quoted, numeric and hyphenated
names, duplicate requests and `reading`. It does not inspect source or bindings.

H (`qwen-context:h-q4_0-24k`) returned a body-only draft in 11,239 ms tool wall
time. Inspection found doubled regex escapes, no dictionary capture, match-array
length mistaken for request count, invalid capture indexes and a missing null
guard. The draft was not executed. The ignored raw artifact is
`benchmark-data/language-eval/python-dictionary-development/local-request-draft.json`.
Sol repaired the helper and added focused recognizer tests. No planner, AST
shortlist or existing production integration changed in this piece.

Validation: direct `node --import tsx` execution passed all three named tests;
`npm run typecheck`, scoped Biome lint and `git diff --check` passed.

Second bounded piece: `pythonDictionaryEntryRows` accepts one to three plain
literal entries in a valid Python dictionary node. Keys must be unescaped,
unprefixed single-line strings with unique canonical content. Values must be
plain strings or unadorned decimal integers/floats. Every pair occupies one
physical row; multiple pairs on that row yield one source row. Unsupported
entries reject the whole dictionary. No parser construction or IO is in the helper.

H returned this body-only draft in 13,914 ms tool wall time. It referenced an
undefined `node`, lacked an outer closing brace and returned from inside a key
loop before validating later keys. It did not check canonical duplicates,
single-row pairs or complete plain-string values, and rejected repeated rows
instead of deduplicating them. The typed interface was supplied. The draft was
not executed; its ignored artifact is `local-entry-draft.json` beside the first
draft. Sol repaired it and added pinned Python parser tests plus field-error
overlays for missing/error flags. This attempt does not establish general model
routing performance.

Validation after the second piece: all six named tests, TypeScript, scoped
Biome lint and `git diff --check` passed.

Third bounded piece: `pythonDictionaryPlanForTree` validates a strict whole-module
shape and returns source rows only. It accepts one optional named module literal
and unique zero-parameter undecorated functions with direct string-key returns,
optionally preceded by one local literal. Every function must fit this shape.
The named target's local literal wins over the module literal; a missing local
key cannot fall back. Async functions and comments are supported. Imports,
decorators, annotations, aliases, mutations, extra statements, parameters,
nested scopes and malformed/missing nodes reject the whole plan. Headers and
returns must fit one physical row; initializers must open on the assignment row.
These bounds provide a source shortlist, not binding or runtime verification.

H returned the supplied-interface body draft in 22,311 ms tool wall time.
It required exactly one module child, then searched that sole assignment for a
function, so its supported path could not return a plan. It also used wrong
child indexes and `any`, compared subscript values with the reader name,
treated numeric entry rows as key records and omitted name/comment/local-shadow
checks. The draft was not executed. Its ignored artifact is `local-plan-draft.json`
beside the earlier drafts. Sol repaired the helper. Nine named tests, TypeScript,
scoped Biome lint and `git diff --check` passed. Parser fixtures are development
unit inputs; no frozen model evaluation was rerun for this piece.

Fourth bounded piece: four new source-only files and four questions are frozen
in `2026-10-09-python-dictionary-eval.json`. Answer keys and required rows were
checked directly against source, without the tree planner:

| ID | Source | Required rows | Checked answer |
|---|---|---|---|
| PD-MODULE | python/module.py | 1, 2, 3, 13, 14 | Module POLICY; queued; 13 |
| PD-LOCAL | python/local.py | 6, 7, 8, 9, 11 | Local SETTINGS; ephemeral; 5 |
| PD-ASYNC | python/async.py | 1, 2, 3, 13, 14 | Module OPTIONS; deferred; 8 |
| PD-PARAM | python/parameter.py | 6, 7 | CONFIG parameter shadows module; caller mode/attempts unknown |

Manifest SHA-256:
`23d07f4887ce460e4cf0ae8a3e634b61680c4248a626ab47ebad70e8b0a203fd`.
The manifest also pins all four source hashes. No prior frozen fixture changed.
H supplied the source-only draft in 12,523 ms tool wall time. Names, values,
shadowing and async shape were retained; Sol repaired only dictionary layout
and final newlines because the draft ignored those explicit format requirements.

The new fixture validator checks exact files/IDs, Python language, hashes and
literal source references independently of planner semantics. Symlink sources
and nested Git directories fail; only root Git metadata is excluded. The thin
wrapper reuses the existing source-only Git runner with selected-only answers.
Golden answers and required/forbidden fields stay outside model prompts.
Four validator tests and three mocked runner tests passed, including setup-time
pin failures and malformed raw preservation. Strict script TypeScript, repository
TypeScript, scoped Biome lint and diff checks passed. No real generation ran;
manual review metrics remain pending/null. This small freeze does not establish
general binding coverage, routing performance or selection improvement.

Next bounded step: commit the freeze, then run the baseline while the three
helpers remain unused:
`node --env-file-if-exists=.env --import tsx scripts/experimental/run-python-dictionary-eval.ts`.
The ignored default is
`benchmark-data/language-eval/python-dictionary-development/baseline.json`.
Only after that baseline, integrate source shortlists and run the same frozen
queries with `--output benchmark-data/language-eval/python-dictionary-development/enhanced.json`.
Preserve generic semantic review; a source plan must never auto-add evidence.
Frozen evaluation manifests and raw results remain unchanged.

## Integration and enhanced run

Integration (`8f91542`): `createRelationshipChecks` takes the full query. For a
named `Which X dictionary does F read` request it adds a "Python dictionary source
rows" check. Alternatives are the planner rows in one unique top-level Python
reader file (source under 24,000 chars). A missing plan or undisplayed row gives no
passing alternative. H's mapper draft was not applied: the existing checklist
already maps locations to displayed refs. Status stays `needs_review` because
generic completeness is unchanged. Three tests added to `test:local-explore` (156 pass).

Same frozen four queries, raw `enhanced.json` (SHA `8da81f87…f5cd`), review in
[the sidecar](2026-10-09-python-dictionary-review.json):

| | Baseline | Enhanced |
|---|---|---|
| Required rows selected | 14/17 | 17/17 |
| Correct and complete | 1/4 | 3/4 |
| Question time | 103,322 ms | 102,130 ms |

MODULE and ASYNC became correct (queued/13, deferred/8). PARAM still fails: the
answer is cut off, it selected module line 3, and it never names the parameter
shadowing. Review was lead-only and not blind. Four cases, one run each: this shows
the checklist helps these shapes, nothing broader.

## Fresh set (five questions) and parameter shadowing

Frozen before any run (`2593acf`, manifest SHA `af09af0f…7ee1`): three
shadow shapes (plain, default, annotated parameter), an async local dictionary
and a module dictionary beside two local ones. Review: [sidecar](2026-10-10-python-dictionary-fresh-review.json).

| | Baseline | Source rows + shadow plan | Post-fix |
|---|---|---|---|
| Answers with a false claim | 4 | 3 | 0 |
| Correct and complete | 1/5 | 1/5 | 1/5 |

- The shadow plan alone anchored the header and return rows, but H still selected
  the module `attempts` row and the answer asserted the module value.
- Post-fix (`cf3cad4`) accepts default/annotated parameters and strips the module
  dictionary's rows from selected evidence when a parameter shadows it. No answer
  asserted a module value afterwards.
- Still not complete: shadowing is never stated in words, FR-TYPED is cut off
  (now flagged `incomplete_text`) and FR-MODULE omits the mode value.
- The fixes were built from this set's results, so post-fix is development data.
  Held-out evidence needs a new frozen set. One run each, non-blind.

## Held-out set (five questions)

Frozen in `06b2ac8` (manifest SHA `bfb47e24…a15`) before any run; code unchanged
for the run. Shapes: keyword-only parameter, annotated default parameter, closure,
`global` read, class attribute beside a module dictionary. Review: [sidecar](2026-10-10-python-dictionary-heldout-review.json).

| | Held-out |
|---|---|
| Answers with a false claim | 1 (HO-CLASS) |
| Correct and complete | 1/5 (HO-CLOSURE) |

- HO-CLASS: answer read the class attribute (`log`, 3) instead of the module
  dictionary; the checklist has no class-scope rule.
- HO-GLOBAL omitted the mode value (the open omitted-value case); the two
  parameter cases avoided false claims but stayed incomplete.
- One run each, non-blind, n=5: the strip fix held on new parameter shapes, the
  class-scope shape is a new gap.

### Class-scope fix (development data)

`Class.method` requests now plan the module dictionary rows plus the method header
and return, and strip the class attribute's rows from selected evidence. Rerun of
HO-CLASS only: the false claim (`log`, 3) is gone, but the answer still omits the
values (`linear`, 5) and says the module dictionary is unknown. The held-out set is
now development data; the omitted-value case is next.
