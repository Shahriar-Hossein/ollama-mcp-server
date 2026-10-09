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

Next bounded step: inspect Python dictionary declarations and reader bodies to
shortlist source windows for an explicit named request. Preserve shadowing and
unsupported binding cases as unresolved; lexical proximity cannot prove a read.
Frozen evaluation manifests and raw results remain unchanged.
