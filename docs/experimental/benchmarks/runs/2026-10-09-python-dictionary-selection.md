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

Next bounded step: shortlist named dictionary declarations and reader bodies
using these helpers. Preserve shadowing and unsupported binding cases as
unresolved; literal entry rows alone cannot prove a reader uses that dictionary.
Frozen evaluation manifests and raw results remain unchanged.
