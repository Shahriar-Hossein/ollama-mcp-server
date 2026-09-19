# Project reality check — 2026-09-19

**Verdict: keep the experiment, narrow the operational claims, and repair the measurement process before expanding the architecture.** You have useful evidence that inexpensive models can perform specific bounded tasks. You do not yet have evidence that the complete delegation system reliably saves parent-model quota or work, and the Super Explorer “12/12” claim is contradicted by its own saved answers.

Your goal is sensible: learn which small or inexpensive models deserve which jobs, then reuse that knowledge through MCP, scripts, or a custom harness. Success does not require replacing a frontier assistant. A worker that reliably extracts one useful result, with cheap validation, can be valuable even if it cannot investigate an unfamiliar repository independently.

This review distinguishes **observed artifacts**, **historical reported results**, **code findings**, and **proposed experiments**. The distinctions matter more than any model leaderboard.

## Scope and confidence

Reviewed checkout: `ac66084c3e73657585ec2cfe1c4461f972e740a0`. I read the project instructions, bridge and worker implementations, benchmark indexes and recommendations, capability-matrix methods/results and grader excerpts, Super Explorer orchestration/discovery/verification/synthesis, recorded sweep answers, planning documents, and the agent conversation.

I rechecked 30 saved Super Explorer records without making model calls, inspected the current gold checker, ran `tsc --noEmit` successfully, and ran harmless parser/hook probes. No potentially destructive git command was executed. This is a project and evidence review, not a complete security audit or a fresh model benchmark. Historical capability-matrix scores below are reported results; I did not independently replay every ignored raw response. The later citation-matrix logs were not present at their referenced repo or default temporary paths, so those timings are treated as reported evidence.

## What is genuinely good

- **The task-based direction is right.** Extraction, repair, investigation, summarization, tool use, and scoped editing are different capabilities. The capability matrix recognizes this instead of pretending one model score measures everything.
- **Some graders inspect actual behavior.** Executing submitted functions against edge cases, checking hidden edit tests, and verifying resulting files are much stronger than accepting a model's “done.”
- **Failures have produced useful engineering knowledge.** Context defaults, output truncation, inline reasoning, unsupported tool calls, model residency, and grader bugs all affected outcomes. Discovering those interactions is part of learning how to use these models.
- **There are meaningful held-out failures.** Ministral's F1 runtime failure and Gemma's U1 miss survived five public-fixture passes. Those are valuable demonstrations that repetition does not equal generalization.
- **The basic bridge remains useful.** Stateless calls can be enough for a well-specified task. MCP is a convenient interface; the result contract and checks can also serve a script or custom harness.
- **Several safeguards are worth preserving.** Autonomous execution is opt-in. The local worker passes parsed argv directly to execution. Explorer work has budgets. Super Explorer separates proposed claims from evidence assessment and keeps citation provenance.

Sources: [capability-matrix results](../benchmarks/runs/2026-09-16-capability-matrix-results.md), [early trials](../benchmarks/runs/2026-09-12-early-trials.md), [worker implementations](../../src/tools/), [Super Explorer design](../super-explorer/README.md).

## The most serious finding: successful requests were reported as successful answers

The [September 19 sweep narrative](../super-explorer/benchmarks.md#embedder-gpu-contention-fix--limittimeout-sweep-2026-09-19) describes 11/12 for Qwen 4B at limit 40, 7/12 for Qwen 2B, and six successful retries at limit 80. The saved outputs show:

| Saved batch | Records | No `error` field | At least one cited claim | Pass current gold phrase/file checks |
|---|---:|---:|---:|---:|
| [4B, limit 40](../benchmarks/runs/2026-09-19-sweep4-limit40-qwen4b-results.json) | 12 | 11 | 3 | 0 |
| [2B, limit 40](../benchmarks/runs/2026-09-19-sweep5-limit40-qwen2b-results.json) | 12 | 7 | 1 | 0 |
| [Limit-80 retries, both models](../benchmarks/runs/2026-09-19-sweep6-retry-limit80-results.json) | 6 | 6 | 0 | 0 |

The reported pass counts match the **absence of exceptions**, not correctness. I cannot establish which historical scoring step introduced the mistake, but the mismatch itself is unambiguous.

All six limit-80 retry answers are either “I could not materialize evidence for a supported answer” or “I could not verify a supported answer from the supplied evidence.” All have empty `cited_claims`. These are abstentions, not successful answers. That conclusion does not depend on the gold checker's overly literal wording requirements.

The earlier limit-40 batches contain a few partial claims, such as locating the introduction commit without the required changed-file evidence. Their 0-pass automated regrade should not be misread as “no useful information anywhere.” It does mean those artifacts do not substantiate the stated complete-answer scores.

There is a second problem: rerunning only failed questions at limit 80 and combining them with limit-40 results cannot establish 12/12 at limit 80 even if every retry were correct. It establishes an adaptive retry policy only if that policy was explicitly defined, with every attempt and its cost counted.

The later reported SE-01/SE-03 matrix is 0/2 in all four settings. That adds a reproducibility concern, but the original artifacts already refute the headline. **Withdraw “clean 12/12” as an answer-quality claim; retain the original records and annotate the correction.** The latency and exception-rate observations remain distinct evidence.

## What the other benchmarks establish

| Evidence family | Defensible interpretation | Interpretation to avoid |
|---|---|---|
| Original extract/fix/summary fixtures | Specific failure modes and configuration sensitivity | General “best coder” or “worst model” labels |
| Capability matrix, five repeats | Repeatability on unchanged prompts/settings | Five independent task successes or a population reliability estimate |
| One held-out variant per category | Some transfer beyond the public wording; 26/28 Track A pairs passed as reported | Broad competence across extraction, debugging, or instruction attacks |
| T1/G1 tool/edit fixtures | Promising constrained workflows with independently checked outcomes | Open-ended autonomy or competence in a different tool harness |
| Local-explorer pilot | Reported Qwen 4B 4/5 in 88.4s; Haiku 5/5 in 26.9s on that small repo | Proven delegation savings, or a universal frontier/local speed comparison |
| Later local-explorer trials | Harness/configuration changes can materially alter outcomes | Stable model identity alone predicts performance |
| Hybrid retrieval result | Reported top-10 evidence recall improved from 68.1% to 84.7% on the 12 questions | Improved complete-answer accuracy, or a measured advantage on larger repos |

Sources: [master record](../benchmarks/MASTER.md), [capability results](../benchmarks/runs/2026-09-16-capability-matrix-results.md), [local-explorer pilot](../benchmarks/runs/2026-09-16-local-explorer.md), [Super Explorer benchmarks](../super-explorer/benchmarks.md).

The matrix is the strongest part of the current learning program. Its transfer tests are still mostly nearby variants, not independent task families. C1's exact decline string is a useful contract test but not a general prompt-injection benchmark. R1's fact lookup is not a general long-context comprehension benchmark. One port-validation repair is not a general repository-edit benchmark.

The same small repository and related questions have been used repeatedly to tune retrieval, guards, schemas, limits, and prompts. Treat those questions as a development set now. Adding questions about newly built internals does not create an independent evaluation of real user work. Include unseen repositories and structurally different tasks.

The think-on/off comparisons also need qualification. The later local-explorer 8/12→10/12 comparison changed tool/file budgets and timeout as well as thinking. It compares two configurations, not the isolated causal effect of thinking. Similarly, embedding unload is a plausible explanation for reduced timeouts, but the saved sweep does not demonstrate improved answer accuracy.

## What is wrong with the current measurement system

**The gold checker is a useful smoke check, not a correctness oracle.** [gold-set-cli.ts](../../src/super-explorer/gold-set-cli.ts) searches for substrings in the answer and citation text. It neither proves that a cited range supports a claim nor rejects all extra false claims. It can reject equivalent wording such as `120000` versus `120_000`. SE-36 currently requires all three spellings `1,600`, `1600`, and `1_600`, rather than accepting alternatives. Fix the rubric, not the model, for that case.

Keep separate fields for execution success, format compliance, factual correctness, completeness, citation validity, scope compliance, and abstention. A safe abstention is better than a fabricated answer but still leaves the user's task unfinished. Report accepted-answer coverage alongside correctness among accepted answers; an always-abstaining system must not look perfect.

**The runner does not provide a dependable success signal.** The gold CLI prints FAIL without setting a failing exit status. Unknown IDs are skipped; an empty selection can produce 0/0 PASS. The serial shell script can therefore finish successfully while all answers fail. The supervisor's status branch does not implement its comment's promised failed/done exit semantics, and it does not persist a definitive exit record. Its lock only coordinates callers using that same lock; another MCP client or runner can still contend for Ollama. A second start can also truncate the supervisor log before failing to acquire the lock. See [gold CLI](../../src/super-explorer/gold-set-cli.ts), [matrix runner](../../scripts/run-super-explorer-matrix.sh), and [supervisor](../../scripts/run-matrix-supervised.sh).

**Evidence retention is too weak.** The benchmark README explicitly allows deleting raw responses after recording summary numbers. This review shows why the opposite is needed for decision-bearing runs. Preserve a small canonical artifact bundle containing prompts, outputs, grading, identities, and runtime settings. Large ancillary logs can live outside git with a durable location and checksum. Archive unsuccessful attempts too. Version regrades and apply rubric corrections consistently to all affected outputs.

**The benchmarked configuration is not necessarily the deployed configuration.** The single-call MCP tools expose no equivalent context/output/seed profile, and still default to `qwen2.5-coder:3b`. A result obtained with explicit 16K settings does not validate a route that silently uses daemon defaults. Tie routing to model artifact + runtime + prompt + harness + budgets + validator, not a model name alone.

## Architecture: keep the useful pieces, make each earn its place

There are really three systems here:

| System | Current assessment |
|---|---|
| One-shot delegation and summarization | Closest to useful everyday offloading; needs artifact input, validation, and metrics |
| Bounded read/search/edit loops | Promising for explicit tasks; require capability-specific tools, scope enforcement, and verified outcomes |
| Super Explorer indexes, retrieval, discovery, verifier, knowledge store | An interesting research subsystem whose additional complexity has not yet demonstrated end-to-end value |

The exploration pipeline imposes a demanding task on a small model: propose precise claims, construct typed evidence targets, and satisfy another model-driven verification contract. Failures at these stages do not measure repository understanding alone. The recorded cloud-model improvement when switching to the tool loop supports investigating the harness, not concluding that policy fine-tuning is already justified.

**Synthesis is not dropping details through paraphrasing.** [synthesis.ts](../../src/super-explorer/synthesis.ts) deterministically prints the existing supported claim text. [explore.ts](../../src/super-explorer/explore.ts) copies discovery hypotheses into verification claims. If a hypothesis omits the timeout literal or gate mapping, synthesis cannot recover it. Trace each required answer fact through retrieval → hypothesis → materialized evidence → verdict → printed claim before deciding where to fix completeness. The diagnosis in [agent-conversation.md](../agent-conversation.md) is therefore not established.

**“SUPPORTED” means model-approved, not proven true.** The verifier checks schema, IDs, evidence indexes, and presence of citations, but the semantic support judgment remains a model decision—normally by the same model used for discovery. Errors can be correlated. Evaluate false claims paired with real but irrelevant evidence, negated guards, incomplete evidence, stale excerpts, and conflicting sources. Do not use model confidence labels as the acceptance gate: later runs contain high-confidence fabrications.

**Persistent learning is not connected end to end.** Storage and invalidation exist, but the inspected `exploreRepository`/discovery/hybrid flow does not read previous knowledge or automatically save new findings. The proposed compounding benefit is not yet a measured feature of that path. Also, a commit hash alone does not identify dirty working-tree content: the indexer reads current files. Knowledge writes enforce a clean tracked checkout, but ordinary exploration needs an equally explicit snapshot policy if citations claim revision fidelity.

**Framework coverage is narrower than its name suggests.** The current index and WordPress adapter operate on supported JS/TS source. They do not establish PHP/WordPress backend exploration capability. Measure the actual languages and repository shapes you intend to use.

A useful next comparison is plain lexical retrieval + direct answer versus hybrid retrieval + direct answer versus bounded tool loop versus the existing staged pipeline. Give every route the same held-out questions and grade final outcomes independently. Keep the extra stages only if they measurably improve the tradeoff you care about. Defer fine-tuning and parallel discovery workers until that comparison exists.

## Operational gaps that matter for small, low-risk agents

These are concrete reasons not to broaden autonomous scope yet:

| Finding | Consequence and next action |
|---|---|
| `summarize_output` receives the full text as an argument | If the parent already read it, the context cost has already occurred. Let a producer write an artifact and give the worker a bounded reference; return summary, exact critical excerpts, and source locations. |
| `generate()` returns only text and can fall back to the thinking field | Preserve final-answer status, truncation, usage, timings, and response channel. Handle model-specific formatting explicitly; reasoning text is not automatically a valid final artifact. |
| Local autonomous worker has no fetch deadline/status/schema checks or tool-name validation | Add validated calls, bounded output, total-job deadlines, and independently verified completion before using it on real changes. |
| Git policy allows broad options | Parser probes accepted `git diff --output=/tmp/example` and `git commit --amend --no-edit`; chaining was rejected. Subcommand validation is not operation-scope validation. Prefer fixed operations and allowed paths. |
| Cloud hook accepts malformed JSON | Probe exited 0. Fail closed at the validation boundary; the local direct-argv guarantee does not automatically apply to the cloud Bash tool. |
| Explorer containment uses lexical paths | An in-root symlink can point outside. Add canonical-path containment and tests; no-shell operation is not filesystem isolation. This is a static finding, not an executed exploit. |
| Git workers share repository/index state | An earlier experiment committed an unrelated staged file. Use isolated workspaces and verify exact changed paths; do not reset user state to make a worker's task easier. |
| No usable `npm test` suite | Type checking passed, but does not validate the above behaviors. Add focused tests for scope, path handling, malformed responses, grading, and revision identity. |

Sources: [shared client](../../src/ollama-client.ts), [summarizer](../../src/tools/summarize-output.ts), [local worker](../../src/tools/run-local-worker-task.ts), [explorer](../../src/tools/local-explorer-task.ts), [allowlist](../../src/shell-allowlist.ts), [cloud hook](../../scripts/validate-cloud-bash.cjs), [existing backlog](improvements-backlog.md).

Cloud comparisons need a capability probe too. Ollama's current documentation says its cloud does not support structured outputs. Do not assume a schema supplied through the local endpoint gives cloud tags the same enforcement as local models; record actual endpoint behavior. This is a potential confound, not a retrospective explanation of every failed run. [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

The API already exposes completion reasons, token counts, and timing fields, so much of the missing telemetry can be retained without building a new framework. Resolve the local model digest separately when available; it is not a documented field of every generate response. [Ollama generate API](https://docs.ollama.com/api/generate).

## A provisional model map

These are candidates for checked use, not general model rankings. They reflect this repository's recorded fixtures and configurations, not a fresh survey of available models.

| Candidate | What the evidence makes it worth trying | Boundary |
|---|---|---|
| `qwen3.5:4b` | Broadest local candidate across the capability matrix; bounded read/search and small checked edits | Explorer reliability varies; citation fabrication and incompleteness remain possible |
| `granite4.2:3b` | Self-contained extraction/summaries; spec-sensitive code with the tested thinking/output budget | One-shot strengths did not transfer into an efficient tool loop; account for reasoning format and latency |
| `nemotron-3-nano:4b` | Extraction, summaries, and the tested constrained edit | G1 success did not transfer to general explorer behavior; incomplete-evidence handling was weaker |
| `qwen2.5-coder:7b` | Tested self-contained code repair candidates | Pseudo-tool output makes it unsuitable for this native tool loop without a separately validated adapter |
| `ministral-3:3b` | Fast draft/code candidate where validation is cheap | Held-out F1 behavior failure and report-format misses prevent broad trust |
| `gemma4:e2b` | Tested fact-retrieval candidate | That does not establish dependable investigation or evidence-boundary judgment |
| `qwen3.5:2b` | A speed/size challenger for future bounded trials | Do not promote it using the invalid 12/12 claim |
| Tested cloud tags | Separate candidates for bounded tasks and lightweight native tool loops | No general winner or guaranteed free/unlimited route is established |

Keep DeepSeek/EXAONE and other poor fits out of the current operational shortlist unless a particular task or runtime change warrants a controlled retest. “Poor fit under this harness and budget” is more defensible than “bad model.” Do not maintain ten active routes when two finalists can answer the next experimental question.

There is a factual documentation error worth correcting later: `model-classification.md` says Ministral fenced G1 output 4/5 times, while the master/results report 4/5 passes and one format failure. Older “only model” and “best overall” claims also conflict with later results. Maintain one dated routing table with explicit evidence scope.

## Measure whether delegation helps the parent

Your metaphor is directionally right, but model parameter count is not a measured multiplier for cost or usefulness. Sometimes the smallest appropriate machine is a parser, grep, a formatter, or a deterministic script. Use a model where language interpretation or synthesis is the remaining work.

A good delegated task has bounded input, a clear output contract, cheap independent checking, and a recoverable failure. A task can be short yet require difficult judgment; “small” and “easy to delegate” are not synonyms.

Measure the complete workflow:

`delegated effort = dispatch + worker execution + validation + repair/escalation`

For parent usage, compare direct-work usage with dispatch/returned-context/review usage plus the observed fallback usage. Record actual parent metrics where available. Worker token counts, worker latency, and parameter counts cannot be converted into subscription quota savings by assumption. Report unavailable quota accounting as unknown.

Track quality, parent input/output, parent tool calls, elapsed time, human review time, retries, and accepted results per task. A slower worker may still be worthwhile for background tasks or privacy. A fast worker that requires the parent to redo every answer is not a useful offload. Account for local load time, electricity/hardware opportunity cost, and cloud availability separately; “no marginal API bill” is a narrower claim than “free.” Cloud terms can change. [Ollama pricing](https://ollama.com/pricing).

## What to do next, in order

1. **Repair the evidence baseline.** Mark the 12/12 claim withdrawn, preserve the existing artifacts, and separate execution from answer-quality fields. Correct the checker and runner completion semantics. Add adversarial grader examples: abstention, correct paraphrase, keyword-filled wrong answer, and real-but-irrelevant citation. Freeze the rubric before another comparison.
2. **Make one useful delegation route observable.** Start with artifact-based log extraction/summarization or another task you actually repeat. Use deterministic parsing where possible. Return a compact result with evidence, validation outcome, limitations, and metrics. Keep the parent from ingesting the full artifact first.
3. **Run a small, decision-focused evaluation.** Choose Qwen 4B plus one task-specific challenger. Use 30–50 genuinely different tasks across 2–3 real repositories, divided into task families and development/held-out sets before tuning. Include missing evidence, distractors, long inputs, and scope traps. This is a practical first screen, not proof of a 99% reliability target.
4. **Compare workflows, not just models.** Evaluate a deterministic baseline, the selected worker route, and the parent doing the same task directly. Keep accepted-output standards equal. Record failed attempts and review/fallback work. For exploration, add the architecture comparison described above, serially on the local GPU.
5. **Promote a narrow task profile only when it helps.** Define allowed inputs/tools/paths, context/output/job budgets, validator, and escalation condition. Agree on an acceptable error and latency budget for that task. Require no unreviewed scope violations in the promotion set, while acknowledging that zero observed violations does not prove zero risk. Stop widening limits merely to improve a development-set score.
6. **Return to richer agents after the route earns trust.** Add stronger planning, persistent knowledge reuse, or fine-tuning only for a measured remaining failure. Training should follow a stable harness, clean trajectories, and an untouched evaluation set—not substitute for them.

Record model digest where available, runtime version, hardware/residency, harness commit, target-tree identity, prompt/schema/grader versions, requested and observed budgets, seed/temperature, retry policy, and cold/warm state. One local request in flight is necessary for comparable measurements; a 20-second pause alone is not proof of isolation.

## Assessment to carry forward

You have learned real things: some small models can solve carefully bounded work; tool use is a distinct capability; format and output budgets matter; reported completion is not verified completion; and harness design can dominate results. That is a worthwhile experimental outcome.

The project currently overstates what some of those lessons prove. Its immediate bottleneck is trustworthy evaluation and a measured delegation workflow, not finding a magically stronger tiny model. The highest-value next milestone is **one task family that produces independently accepted results while reducing parent effort on unseen examples**.

Next actionable step: implement the grading/result-status correction, then the artifact-input route. Material uncertainty: generalization to unfamiliar repositories, verifier false-positive rates, actual parent savings, and whether Super Explorer's extra stages improve the workflow.

## Reanalysis provenance

The table above replays the current checker's file/phrase logic against saved answers, not new generations. These artifacts lack enough runtime identity to reconstruct every historical condition; the regrade is an explicitly current-checker audit, not a claim that today's code produced the stored responses.

Artifact SHA-256 fingerprints:

```text
sweep4-limit40-qwen4b: 9ab71ecb926819b5385bdc9e939341df90d438d00a1ecad001754e9d59c69eb5
sweep5-limit40-qwen2b: 775151c983392c62682c6e5dfe23d3abfde49264ae9ef58268767ef11bce7956
sweep6-retry-limit80: 85602ddb68dceaa0384f5d253f2de16e8905c2a1beed68330abdb12776c9a2e6
```

Reproduce from the repository root, without Ollama:

```bash
python3 - <<'PY'
import json, pathlib, re
source = pathlib.Path('src/super-explorer/gold-set-cli.ts').read_text()
checks = {key: (json.loads(files), json.loads(phrases))
          for key, files, phrases in re.findall(
              r'"(SE-\d+)": \{ files: (\[.*?\]), phrases: (\[.*?\]) \}', source)}
assert len(checks) == 50, 'Checker format changed; review this reanalysis.'
for name in ('sweep4-limit40-qwen4b', 'sweep5-limit40-qwen2b', 'sweep6-retry-limit80'):
    path = pathlib.Path('docs/benchmarks/runs') / f'2026-09-19-{name}-results.json'
    rows = json.loads(path.read_text())
    passed = 0
    for row in rows:
        files, phrases = checks[row['id']]
        answer = row.get('answer_to_user', '').lower()
        citations = '\n'.join(c for claim in row.get('cited_claims', [])
                              for c in claim['citations']).lower()
        passed += (not row.get('error') and
                   all(f.lower() in citations for f in files) and
                   all(p.lower() in answer for p in phrases))
    print(name, 'records', len(rows),
          'no_error', sum(not r.get('error') for r in rows),
          'with_claims', sum(bool(r.get('cited_claims')) for r in rows),
          'gold_pass', passed)
PY
```
