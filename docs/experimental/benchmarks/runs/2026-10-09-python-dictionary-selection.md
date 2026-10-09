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
