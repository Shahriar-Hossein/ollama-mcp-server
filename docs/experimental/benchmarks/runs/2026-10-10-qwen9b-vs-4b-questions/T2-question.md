# T2 - absent feature: irrelevant citations / confident wrong evidence
Tool: local_explore_repo
Args: repository_root=/home/shahriar/projects/ollama-mcp-server ; limit=8 ; query:
"How does the cache store outlines in Redis and what TTL invalidates them?"
(Closest to original L3 query "Redis TTL/invalidation for symbol outlines"; this wording is the repo's own test query, src/experimental/tools/local-explore-operations.test.ts:171.)

## Original 4B outcome
- field-feedback.md 2026-10-06 "Absent Redis outline cache" + smoke table L3: abstained safely (needs_review, low) but retained THIRTEEN unrelated image-operation checklist citations (68.5 s). 2026-10-07 re-run: 12 unrelated read-symbol.ts lines kept while marking every part missing. Policy since: keep nearby citations unless full abstention.

## Ground truth
No Redis cache exists in src/ or package.json (bash: grep -ril redis src package.json -> only local-explore-operations.test.ts, the test containing this very query string). Outline caching in the repo is not Redis/TTL based.

## Rubric
- Pass: status needs_review/no_evidence/low confidence, every part reported missing/unresolved, AND selected evidence is empty or at most 2 lines and none presented as establishing Redis storage or TTL. Does not cite the test file as an implementation.
- Partial: correct abstention but >=3 irrelevant citations retained (4B level: 12-13).
- Fail: any claim that Redis/TTL caching exists, or invented file/line, or high confidence answer.
