# Python dictionary selection handoff — 2026-10-09

Branch `main`; implementation/evaluation baseline `4fec7ab`. Goal is paused for
handoff; resume it explicitly in the next session. No total token budget was set.

## Working agreement

H `qwen-context:h-q4_0-24k` attempts small defined tasks first. Inspect and document
failures, then use Sol (user approved fallback when Luna was unavailable).
One implementation agent at a time, one local commit per piece, no pushes.
Lead plans/reviews/runs tools; implementation edits stay delegated.
After 2–3 pieces, improve the harness based on observed failures.

## Done and verified

- `b8d845d`: explicit question recognizer.
- `9da5ebb`: complete literal dictionary entry rows.
- `e50ff88`: strict source-tree shortlist. Nine named helper tests pass.
- `4fec7ab`: fresh four-case source-only fixture and runner; seven fixture/runner
  tests, strict script/repository typechecks, scoped lint and diff checks pass.
- Details/limits: [selection checkpoint](2026-10-09-python-dictionary-selection.md).
  Helpers are still UNUSED by `local-explore-repo.ts`; no integration yet.
- All three H code drafts failed inspection and were repaired by Sol. H's source
  data retained correct names/values but needed multiline dictionaries/newlines.
- New manifest: `2026-10-09-python-dictionary-eval.json`, SHA-256
  `23d07f4887ce460e4cf0ae8a3e634b61680c4248a626ab47ebad70e8b0a203fd`.
  Four source hashes and independent keys are frozen; do not edit them.
- One real H baseline finished against clean `4fec7ab`; raw file:
  `benchmark-data/language-eval/python-dictionary-development/baseline.json`,
  SHA `eae3b11b6997a345abff98a41c283234e3ffaf7c9ec372cfe532230b28069e4f`.
  Required 17, retrieved-range 11, packed 17, selected 14; all `needs_review`.
  Total question intervals 103,322 ms; individual stage times are in raw JSON.

Initial lead inspection (NOT independent final scoring): module answer mixes
queued/13 with neighboring local direct/2 despite complete required selection;
local answer omits literal ephemeral; async selects only header/read and has an
unfinished `OPTIONS[` answer under valid JSON/normal stop; parameter answer
does not infer unused/99 but still needs completeness/citation audit.
Initial lead review: 17:29:37.929–17:30:23.313 UTC, 45,384 ms, source already known.
This agent/tool/reading interval excludes later work; per-case/full workflow
effort and human effort remain unmeasured. Baseline raw manual review stays null.

## Concrete next step

Use the ALREADY COMPLETED H mapper draft; do not call H again for the same task:
`benchmark-data/language-eval/python-dictionary-development/local-ref-draft.json`
(tool wall 6,552 ms; SHA
`f25a90c4003ec82b1996b2da3b1b3fabdacb7971e6fe4ced6cc1cd868d31dbc2`).
It maps required file:line locations to first offered E refs, returns null if
empty/missing, and deduplicates in required order. Initial inspection finds
plausible semantics; it exceeds requested 15 lines. NOT applied, compiled or
tested. Have one Sol worker apply/test it, document actual result, and integrate
the source shortlist plus missing-location gate. Commit that piece locally.

Integration constraints: use full-query named request; unique indexed Python
reader and checked contained source; bound extra source parsing to 24,000 chars.
Existing pure planner deliberately rejects imports, parameters, decorations,
extra statements, mutation/rebinding and other unsupported whole-module shapes.
Map only displayed source-checked refs; missing lines yield no passing alternative.
Do not auto-add selected evidence, infer binding/runtime, replace generic semantic
review, increase six-file/character/two-call/16-ref caps, or change MCP defaults.
Add meaningful unit/integration regressions and register them in scout test command.

Then run same frozen four queries to ignored `enhanced.json` using
`scripts/experimental/run-python-dictionary-eval.ts --output <absolute path>`.
Use one detached `setsid nohup flock -n` supervisor; do not overlap H tasks.
Independently audit BOTH artifacts after clocks start before reading/drafting.
Separate truth, citation support, completeness, retries, latency and correction
effort; retain raw files and write a hash-pinned review sidecar. Report small-pair
limits. Update selection report, field-feedback and language-support checkpoint.

## Process/cleanup state

No evaluator/supervisor process remains; baseline complete and log confirms finish.
`/tmp/ollama-python-dictionary-eval.lock` is free; retaining its file is harmless.
All subagents are completed/idle; no running exec cell or local-model task remains.
No process needs closing. Keep ignored draft/raw artifacts; do not kill Ollama.
Working tree is clean after the local handoff checkpoint commit.
Prior multilingual, scope and citation freezes/raws stay unchanged.
