# T1 - wrong evidence selection (configuration/registration chain)
Tool: local_explore_repo
Args: repository_root=/home/shahriar/projects/ollama-mcp-server ; limit=8 (valid range 8-12) ; query:
"Which environment variables gate the local worker and cloud Claude worker, how are they resolved independently from ENABLE_EXPERIMENTAL, and where are their guarded registrations?"
(Run on current HEAD; line numbers below may drift, match on text.)

## Original 4B outcome
- 2026-10-09 h-q4_0-24k (docs/experimental/benchmarks/runs/2026-10-09-h-flag-packing.md "Live development probe"): packed 9/9 required lines, SELECTED 6/9 (omitted all 3 resolver lines), needs_review, 80-101 s, 2 calls.
- Earlier 2026-10-06 field-feedback.md L1b: partial mappings only, src/index.ts not packed, low confidence.
- Later fixed to 9/9 by deterministic resolver shortlists (2026-10-09-h-resolver-selection.md), so a model that selects well should now reach 9/9. Baseline 4B on pre-fix code was 6/9.

## Gold (9 lines)
src/config/features.ts: `localWorker: autonomousFlag(environment, "LOCAL_WORKER_ENABLED"),` ; `cloudClaudeWorker: autonomousFlag(environment, "CLOUD_CLAUDE_ENABLED"),` ; in autonomousFlag: `if (value === undefined || value === "" || value === "0") return false;` ; `if (value === "1") return true;` ; ``throw new Error(`${name} must be 1 or 0.`);``
src/index.ts: `if (features.cloudClaudeWorker) {` + `registerRunCloudClaudeTask(server);` ; `if (features.localWorker) {` + `registerRunLocalWorkerTask(server);`
Facts: flags are LOCAL_WORKER_ENABLED / CLOUD_CLAUDE_ENABLED, independent 1/0 only, not affected by ENABLE_EXPERIMENTAL (not routed via experimentalFeature).

## Rubric
- Pass: >=8/9 gold lines selected with exact quotes, no wrong claim that ENABLE_EXPERIMENTAL enables them; irrelevant citations <=2.
- Partial: 6-7/9 (4B level = 6), or all lines but with claim that experimental flag can enable them.
- Fail: <=5/9, or fabricated lines/quotes, or no src/index.ts guards.
Score = gold lines selected /9; also note status (needs_review is expected and fine).
