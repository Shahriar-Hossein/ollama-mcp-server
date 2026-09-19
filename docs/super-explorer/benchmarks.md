# Super Explorer — initial benchmark set

This is the first, deliberately small gold set for the repository. It tests
the exploration work this server actually needs: locating symbols, following
registration and configuration paths, checking a security boundary, finding a
bounded control flow, and retrieving a relevant introduction commit. It is not
a model-capability benchmark and is separate from the worker benchmarks in
[`docs/benchmarks/MASTER.md`](../benchmarks/MASTER.md).

## Fixture contract

- **Repository:** `ollama-mcp-server`
- **Gold revision:** `f1a75a19d1708e36f60bba0de76714acc2343492`
- **Scope:** tracked files at that revision; ignore `node_modules`, `.git`,
  generated `benchmark-data`, and untracked files.
- **Answer evidence:** every required relationship needs a file-and-symbol (or
  file-and-line) citation from the indexed revision. File recall alone is not
  a pass.
- **Negative claims:** only accept a negative claim when the question names
  the bounded search scope and the answer says what was searched. Do not turn
  an absent result into a guessed implementation detail.
- **History:** resolve commits from the fixture revision, not from the
  benchmark runner's checkout after it has been modified.

The questions below are intentionally public while the system is being built.
Before comparing approaches, create renamed or structurally equivalent
held-out variants; do not tune retrieval only to these identifiers.

## Gold questions

| ID | Question (ask verbatim) | Gold files and symbols | Required relationships |
| --- | --- | --- | --- |
| SE-01 | Where is `local_explorer_task` registered, and is it enabled by default? | `src/index.ts`: module initialization, `registerLocalExplorerTask`; `src/tools/local-explorer-task.ts`: `registerLocalExplorerTask` | `src/index.ts` imports the registrar and calls it unconditionally. Contrast it with the two autonomous registrars, which are conditional. |
| SE-02 | Which environment variables gate the autonomous tools, and which tool does each gate? | `src/index.ts`: module initialization; `src/tools/run-cloud-claude-task.ts`: `registerRunCloudClaudeTask`; `src/tools/run-local-worker-task.ts`: `registerRunLocalWorkerTask` | `CLOUD_CLAUDE_ENABLED === "1"` gates `run_cloud_claude_task`; `LOCAL_WORKER_ENABLED === "1"` gates `run_local_worker_task`. Neither condition applies to `local_explorer_task`. |
| SE-03 | What host and timeout do ordinary Ollama HTTP calls use, and which operations share them? | `src/ollama-client.ts`: `OLLAMA_HOST`, `REQUEST_TIMEOUT_MS`, `generate`, `listModels` | Both `generate` and `listModels` use `OLLAMA_HOST` and pass `REQUEST_TIMEOUT_MS` to Axios. Defaults are `http://localhost:11434` and `120_000` milliseconds. |
| SE-04 | Trace the timeout error shown by `run_ollama_task` to the shared client configuration. | `src/tools/run-ollama-task.ts`: `registerRunOllamaTask`; `src/ollama-client.ts`: `REQUEST_TIMEOUT_MS`, `generate` | The tool imports and calls `generate`; its `ECONNABORTED` branch reports `REQUEST_TIMEOUT_MS`; `generate` supplies that value as the Axios timeout. |
| SE-05 | How does the local worker prevent a model-supplied git command from using shell chaining? | `src/shell-allowlist.ts`: `SHELL_METACHARACTERS`, `tokenize`, `parseAllowedGitCommand`; `src/tools/run-local-worker-task.ts`: `runShellTool` | `parseAllowedGitCommand` rejects metacharacters, requires literal `git` plus an allowed subcommand, and returns argv. `runShellTool` passes that parsed argv to `spawnSync` without a shell. |
| SE-06 | What independently validates Bash commands for the cloud Claude worker, and how is it attached? | `src/tools/run-cloud-claude-task.ts`: `BASH_VALIDATOR_HOOK`, `HOOK_SETTINGS`, `registerRunCloudClaudeTask`; `scripts/validate-cloud-bash.cjs`: stdin handler | The cloud launcher passes `HOOK_SETTINGS` with a `PreToolUse` `Bash` hook that invokes the validator script. The validator separately rejects commands that are not a bare allowed `git` invocation or contain shell metacharacters. |
| SE-07 | Which functions stop a local explorer model from reading outside its requested repository root? | `src/tools/local-explorer-task.ts`: `resolveWithinRoot`, `runGrep`, `runRead` | `resolveWithinRoot` rejects absolute or parent-escaping relative results; both `runGrep` and `runRead` call it and return a refusal when it returns `null`. |
| SE-08 | How are tool-call and distinct-file-read budgets enforced in `local_explorer_task`? | `src/tools/local-explorer-task.ts`: `registerLocalExplorerTask`, `runRead` | The chat loop increments `toolCallCount` and refuses calls beyond `max_tool_calls`; `runRead` tracks a `Set` of files and refuses a new path after `max_files_read`, while allowing an already read path. |
| SE-09 | What is the default model for local exploration, and what evidence justifies treating low-confidence results as untrusted? | `src/tools/local-explorer-task.ts`: `DEFAULT_MODEL`, `systemPrompt`, `registerLocalExplorerTask`; `docs/benchmarks/runs/2026-09-16-local-explorer.md` | The default is `qwen3.5:4b`. The prompt requires a confidence field and says low confidence instead of guessing; the public tool description directs callers to redo low-confidence searches rather than trust them. The benchmark document records the pilot limitation. |
| SE-10 | If the cloud Bash validation hook receives invalid JSON, does it block the command? | `scripts/validate-cloud-bash.cjs`: stdin `end` handler | The JSON parse failure path exits `0` and explicitly defers to the primary `--allowedTools` gate. It is not an independent block in that case. |
| SE-11 | Which commit introduced the local explorer tool, and which source files did that introduction add or change? | commit `5b0f7d8edecfff3fe2304d8dffc43feff4606412`; `src/index.ts`; `src/tools/local-explorer-task.ts` | The commit subject is `feat: add local explorer tool`; it adds the explorer implementation and changes server registration. Documentation files in that commit are supporting evidence, not substitutes for the source relationship. |
| SE-12 | Does this repository define a usable automated test command for the server? | `package.json`: `scripts.test` | The only declared `test` script prints `Error: no test specified` and exits `1`; answer that no usable automated test command is defined at the gold revision. Do not claim individual source behavior is tested. |

## Scoring

Score each question independently. A result is correct only when all required
files/symbols and relationships are supported by citations. Extra claims must
also be supported; an unsupported extra claim makes the answer fail its
evidence-precision check even if the gold relationship is present.

Record these fields per run:

```json
{
  "benchmark_id": "SE-01",
  "fixture_commit": "f1a75a19d1708e36f60bba0de76714acc2343492",
  "gold_file_recall": 1,
  "gold_symbol_recall": 1,
  "required_relationship_recall": 1,
  "unsupported_claims": 0,
  "tool_calls": 0,
  "input_tokens": 0,
  "output_tokens": 0,
  "latency_ms": 0
}
```

For the initial gate, require 100% required-relationship recall and zero
unsupported claims per answer. Report aggregate file/symbol recall, median
tool calls, tokens, and latency separately; do not let a fast but unsupported
answer count as correct.

## Recording a baseline

Run the full pipeline at the fixture revision, then manually score each cited
answer against the gold table. Save an object with `run_name`, `model`, and a
12-item `runs` array using the fields above; `fixture_commit` must be the gold
revision for every item. Token counts include every model request in the run;
tool calls include retrieval, discovery, verification, and synthesis calls.
Then aggregate it with:

```sh
npm run --silent benchmark:super-explorer -- <repository-root> <scored-runs-json-file>
```

The generated ignored artifact reports answer accuracy (a question passes only
with full relationship recall and zero unsupported claims), average recall,
the rate of answers with an unsupported claim (plus the total count), and
median calls, tokens, and latency. This keeps the gold judgment separate from
the system being measured.

## Luna versus `qwen3.5:4b` Super Explorer (2026-09-17)

This run used SE-01 through SE-05 at fixture revision
`f1a75a19d1708e36f60bba0de76714acc2343492`. Luna ran first against that fixed
revision and produced 5/5 answers with all required relationships supported
and no unsupported claims. Its read-only exploration used seven shell/search
invocations and took about 0.7 seconds of cumulative command time.

`qwen3.5:4b` then ran the production `explore:super-explorer` pipeline once
per question, serially. A 25-second per-question deadline was used so an
unreturned result counts as a reproducible failure rather than an interrupted
foreground process. It passed 0/5: SE-01 and SE-02 failed because discovery
did not return the required single JSON object; SE-03 and SE-04 hit the
deadline; and SE-05 completed in 9,394 ms but returned no verified claim.
The five Qwen wall times were 4,807, 14,576, 25,010, 25,009, and 9,394 ms
(median 14,576 ms). No Qwen answer included an unsupported user-facing claim,
because the pipeline correctly withheld every unsupported result; that is a
safety property, not answer success.

| Explorer | Questions passed | Unsupported claims | Outcome |
|---|---:|---:|---|
| Luna | 5/5 | 0 | All required relationships supported. |
| Super Explorer + `qwen3.5:4b` | 0/5 | 0 | Two invalid discovery responses, two timeouts, one withheld answer. |

This is an answer-quality comparison on identical questions and source
revision, not a fair end-to-end latency comparison: Luna used its native
read-only exploration interface, while Qwen ran retrieval, discovery,
evidence materialization, verification, and synthesis locally. The decisive
finding is nevertheless clear: the current Qwen discovery stage cannot yet
reliably turn retrieved symbol leads into the strict evidence plan required by
the production pipeline. Do not route these five task shapes to it without a
fallback.

Raw artifacts are retained only in ignored
`benchmark-data/super-explorer-luna-local-2026-09-17/qwen3.5_4b-final/`.

Fixture note: the pinned source calls the timeout constant `OLLAMA_TIMEOUT_MS`;
the current gold-table wording calls it `REQUEST_TIMEOUT_MS`. The default
value and shared Axios behavior are the same, so scoring should judge that
relationship rather than the stale identifier spelling.

## Qwen rerun versus Granite trial (2026-09-17)

Both candidates ran the same production `explore:super-explorer` pipeline on
SE-01 through SE-05 at fixture revision
`f1a75a19d1708e36f60bba0de76714acc2343492`, serially, with a 25-second
per-question deadline. `nomic-embed-text-v2-moe` was explicitly unloaded
before each worker series and after the final run. The pipeline loaded it while
performing retrieval, so it was a required concurrent dependency rather than
an avoidable resident model.

| Explorer | Questions passed | Completed answers | Outcome |
|---|---:|---:|---|
| Super Explorer + `qwen3.5:4b` (rerun) | 0/5 | 0/5 | Every question timed out at 25,008–25,012 ms. |
| Super Explorer + `granite4.2:3b` | 0/5 | 0/5 | Every question timed out at 25,008–25,011 ms. |

Neither run emitted a completed JSON answer, so neither made a user-facing
claim or qualified for manual evidence scoring. This does not invalidate the
earlier Granite exploration result, but it does show that Granite is not yet
qualified for this production Explorer path. Keep both models optional first
passes only, with a mandatory fallback.

Raw artifacts are retained only in ignored
`benchmark-data/super-explorer-worker-comparison-2026-09-17/`.

## 150-second rerun: Qwen versus Granite (2026-09-17)

The same five questions and pinned fixture were rerun serially with a
150-second per-question deadline. The longer deadline removed timeouts but did
not produce a passing answer. `qwen3.5:4b` finished all five in 9,878–62,003
ms, but every response failed the discovery JSON/schema contract. Granite
finished all five in 7,955–37,182 ms: three answers were withheld for lacking
materialized or verified evidence, one failed the discovery schema, and SE-05
made only a partial allowlist claim that omitted the required shell-chaining
prevention path.

| Explorer | Questions passed | Timeouts | Outcome |
|---|---:|---:|---|
| Super Explorer + `qwen3.5:4b` | 0/5 | 0/5 | Discovery-format failures on every question. |
| Super Explorer + `granite4.2:3b` | 0/5 | 0/5 | No full, verifier-supported answer; one partial response. |

Increasing the limit is therefore not a remedy for either model on this
pipeline. Raw artifacts are retained only in ignored
`benchmark-data/super-explorer-worker-comparison-2026-09-17-150s/`.

## Gemma cloud trial (2026-09-17)

`gemma4:31b-cloud` ran the same production Explorer pipeline on SE-01 through
SE-05, serially, against fixture revision
`f1a75a19d1708e36f60bba0de76714acc2343492`, with a 150-second deadline per
question. The current runner was used because the pinned fixture predates the
Explorer CLI; the fixture itself supplied all indexed source and Git evidence.
Only one cloud inference request was active at a time. Local semantic
retrieval used `nomic-embed-text-v2-moe` concurrently as the pipeline's
required local dependency.

Gemma completed every question in 9,090--17,583 ms (median 14,437 ms). Strict
manual scoring passed SE-03 and SE-05: it correctly identified the shared
Ollama host/timeout configuration and the tokenized, direct-argv git-command
boundary. SE-01 omitted `src/index.ts` and the default-enable relationship;
SE-02 substituted `ALLOWED_TOOLS_FLAG` for the two environment gates; and
SE-04 withheld an answer because it did not materialize the `generate`
implementation. The SE-02 answer also made one unsupported assertion that the
allowlist constant was environment-variable-backed.

| Explorer | Questions passed | Unsupported claims | Outcome |
|---|---:|---:|---|
| Super Explorer + `gemma4:31b-cloud` | 2/5 | 1 | Completes reliably within the deadline, but does not meet the five-question evidence-quality gate. |

## Nemotron cloud trial and Granite retest (2026-09-17)

`nemotron-3-super:cloud` and `granite4.2:3b` ran SE-01 through SE-05 via the
`explore_repository` MCP tool (same production pipeline as the Gemma trial)
against the existing pinned-fixture worktree
(`/tmp/ollama-mcp-super-explorer-gemma-2026-09-17`, fixture revision
`f1a75a19d1708e36f60bba0de76714acc2343492`). Questions ran serially per model;
only one cloud (`nemotron-3-super:cloud`) request was active at a time, run
concurrently with the local `granite4.2:3b` calls. The tool's own timeout
(`REQUEST_TIMEOUT_MS`, 120s default) applied to both; neither model timed out
on any question. Per-call latency was not captured — the MCP tool does not
return timing metadata.

Nemotron passed SE-03 and SE-05 with full evidence and citations. SE-01's
hypothesis covered only the registration site, missing the `src/index.ts`
call-site relationship and the contrast with the two conditional autonomous
registrars. SE-02 retrieved no evidence connecting environment variables to
either gated tool and withheld an answer. SE-04 retrieved the correct
evidence (the shared `REQUEST_TIMEOUT_MS` constant and both its call sites)
but phrased its own hypothesis as a claim about the constant being "overly
restrictive," which the evidence didn't support, so it self-failed as
INSUFFICIENT despite holding the right citations.

Granite did not pass any question. Every answer was withheld with
"could not materialize evidence" or INSUFFICIENT, including SE-05 where it
retrieved the exact same supporting symbols as Nemotron's passing answer but
only asserted a vaguer, unlinked claim ("validated against an allowlist")
rather than the required chained relationship — this matches the partial,
under-specific pattern from the earlier 150-second rerun rather than a
retrieval failure.

| Explorer | Questions passed | Outcome |
|---|---:|---|
| Super Explorer + `nemotron-3-super:cloud` | 2/5 | Same result profile as Gemma: reliable completion, evidence-format/hypothesis-scoping failures on 3 of 5. |
| Super Explorer + `granite4.2:3b` | 0/5 | Consistent with prior Granite trials: retrieves relevant evidence in several cases but rarely commits to a fully-scoped, verifier-supported claim. |

## Haiku baseline via Explore subagent (2026-09-17)

Claude Haiku, run as an `Explore` subagent (not through the Super Explorer
pipeline — this is the same out-of-pipeline baseline methodology as the
Haiku row in [`docs/benchmarks/MASTER.md`](../benchmarks/MASTER.md)), answered SE-01
through SE-05 directly against the same pinned-fixture worktree.

Haiku passed all five questions with correct citations, including the
`src/index.ts` registration and conditional-gate contrast that both Gemma and
Nemotron missed on SE-01, and the two-variable/two-tool mapping on SE-02 that
both Ollama-hosted models failed to retrieve any evidence for.

| Explorer | Questions passed | Outcome |
|---|---:|---|
| Haiku (`Explore` subagent, no Super Explorer pipeline) | 5/5 | Matches the prior `docs/benchmarks/MASTER.md` result: beats every Super Explorer configuration tried so far on this gold set. |

## gpt-oss:20b-cloud trial (2026-09-18)

`gpt-oss:20b-cloud` ran SE-01 through SE-05 via the `explore_repository` MCP
tool (same production pipeline as the Gemma/Nemotron trials) against the same
pinned-fixture worktree (`/tmp/ollama-mcp-super-explorer-gemma-2026-09-17`,
fixture revision `f1a75a19d1708e36f60bba0de76714acc2343492`). Questions ran
serially.

The model's discovery-stage output failed the pipeline's own JSON schema on
SE-01, SE-04, and SE-05: the tool call errored before reaching verification
(`Discovery model must return one JSON object with hypotheses and
retrieval_gaps`, and on the first attempt a `hypotheses[1]` string in place of
an object). Only SE-02 completed; it retrieved plausible-looking evidence
(`ALLOWED_TOOLS_FLAG`, a `TOOLS` array) but both hypotheses actually named the
wrong gating mechanism — neither matches the real `CLOUD_CLAUDE_ENABLED`/
`LOCAL_WORKER_ENABLED` gates — and self-failed as INSUFFICIENT, so it withheld
rather than asserting the wrong claim. SE-03 was not reached in this run.

| Explorer | Questions passed | Outcome |
|---|---:|---|
| Super Explorer + `gpt-oss:20b-cloud` | 0/5 (4 attempted, 1 outright pipeline failure was skipped) | Worse than Gemma/Nemotron: fails to hold the pipeline's own discovery JSON contract on 3 of 4 attempted questions, and its one completed answer names the wrong environment-variable gate. Not a viable routing target for this pipeline as-is. |

## Discovery retrieval-gap retry (2026-09-18)

`discoverEvidence` (`src/super-explorer/discovery.ts`) previously gave up
after one model call: if the model returned zero hypotheses but named
`retrieval_gaps`, the pipeline withheld an answer immediately, even though
the gaps often described a concrete, searchable lead the first retrieval
pass missed. Added one bounded retry: when hypotheses are empty and gaps are
present, merge the gap descriptions into the retrieval query, re-run
`hybridRetrieve`, merge the new candidates into the original set (deduped),
and re-prompt discovery once more. `model_calls` is now a plain `number`
instead of `1 | 2` to reflect the extra round.

Verification run: `qwen3.5:4b` through the CLI gold-set runner against the
current worktree (fixture revision `8e4ef8acfeff67a28de82f1c191ec3dc617fb609`),
SE-01 through SE-05. Result: still 0/5, and the retry path did not fire on
any of the five questions in this run — discovery returned at least one
hypothesis on the first pass every time (non-deterministic sampling; a prior
run of SE-01 alone did hit the empty-hypotheses case this fix targets).
SE-01's answer improved qualitatively over the earlier SE-01/SE-02-only run
in this session (one hypothesis now resolves to the real
`registerLocalExplorerTask` symbol with a supported citation), but the gold
check still fails on the missing `src/index.ts` call-site citation and the
conditional-gate contrast. SE-02 through SE-05 failed on wrong-pick
hypotheses (hallucinated symbol IDs, wrong gating variable names) rather than
empty ones — the failure mode the still-open gate-condition-expansion item
below targets, not this one.

| Explorer | Questions passed | Outcome |
|---|---:|---|
| Super Explorer + `qwen3.5:4b` (with retrieval-gap retry) | 0/5 | No regression; retry path untriggered this run because discovery no longer returned fully-empty hypotheses. Fix is contained to `discovery.ts`, no indexer changes. |

### Gate-condition expansion (2026-09-18)

Implemented the item below: `indexer.ts`'s `CallEdge` gained a
`guard_condition` field (`guardConditionFor` walks up from a call to the
nearest enclosing `if` whose condition contains `process.env`, stopping at
the call's own function scope; negated if reached only via `else`). Scoped
to `process.env` checks deliberately — an unscoped version that fired on any
enclosing `if` was tried first and made things *worse*: nearly every call in
the codebase sits inside some conditional, so the new retrieval channel
below returned mostly noise until this was narrowed to actual feature-flag
guards.

Three more pieces were needed before this was end-to-end useful, not just
recorded in the index:

1. **New `conditional` retrieval channel** in `hybrid-retrieval.ts`. A
   question like SE-02 shares no vocabulary with the guard text itself
   (`"which env vars gate the tools"` vs.
   `process.env.CLOUD_CLAUDE_ENABLED === "1"`), so lexical/structural search
   never found the guarded symbols regardless of the new indexer field. The
   new channel triggers on gating vocabulary (`gate`, `guard`, `environment`,
   `enabled`, ...) and directly surfaces every symbol reached through a
   guarded call, ranked by term overlap with the guard text.
2. **Naming collision with the fix's own code.** The indexer treats every
   local `const` as an indexable symbol. The first pass named things
   `gatedBy`/`gateNote`/`gateConditionsFor` — which, once indexed, out-scored
   the real `registerRunCloudClaudeTask`/`registerRunLocalWorkerTask` targets
   for any query containing "gate", because those are literally this
   server's own source now. Renamed everything to `guard*` (matching
   `guard_condition` already) to stop self-colliding on the query vocabulary
   it exists to serve.
3. **Two long-standing evidence-resolution gaps in `explore.ts` that were
   silently dropping correct hypotheses**, found by tracing SE-02 runs after
   (1) and (2) started producing the *right* hypothesis text:
   - `exactSymbol` required an exact `symbol:sha256:...` ID match; the model
     frequently echoes a candidate's ID without the `symbol:` prefix, which
     silently zeroed out the claim's evidence and dropped it. Now also tries
     the ID with `symbol:` prepended.
   - A hypothesis citing the guard condition text itself as its evidence
     target (e.g. after seeing `[guarded by: ...]`) had nowhere to resolve to
     — `evidenceForDiscovery` only matched symbol IDs/names. Added a
     fallback: a `kind: "symbol"` request whose target matches a call's
     `guard_condition` (parens-insensitive) resolves to a `source_range` over
     that call site plus the gated symbol.
   - `verification.ts`'s symbol excerpts also gained a
     `// Reached only when: <condition>` trailer, since previously the
     verifier only ever saw the gated function's own body — never proof it
     was conditional at all.

**Net effect, `qwen3.5:4b`, four runs of SE-02 across these fixes:** discovery
now reliably proposes the *correct* hypothesis (`CLOUD_CLAUDE_ENABLED` gates
`registerRunCloudClaudeTask`, `LOCAL_WORKER_ENABLED` gates
`registerRunLocalWorkerTask`) with the right symbol IDs — the specific
wrong-pick failure mode this item targeted is gone. One run got as far as a
`SUPPORTED` verification on the cloud-gate half with the guard condition
correctly in the cited excerpt. SE-02 still didn't clear the gold check in
any of the four runs: the model is inconsistent about naming
`registerRunLocalWorkerTask` correctly (once typo'd as
`registerLocalWorkerTask`, silently dropping that half of the answer) and
about writing the literal variable names into `answer_to_user` rather than
paraphrasing ("uses specific environment variables" instead of naming them),
and the verification-model JSON output itself is still flaky on this model
(schema failures on 2 of 4 runs, independent of this fix). SE-01/03/04/05
were unaffected (unrelated failure modes, not regressions — same or
different pre-existing errors as before this change).

| Explorer | Questions passed | Outcome |
|---|---:|---|
| Super Explorer + `qwen3.5:4b` (gate-condition expansion, 4 runs) | 0/5 each run | SE-02's underlying hypothesis/evidence chain is now correct; still blocked by this model's naming inconsistency and JSON-output flakiness, not by missing gate information. |

## Cloud model re-test after gate-condition expansion (2026-09-18)

Re-ran all four available cloud models — `gpt-oss:20b-cloud`,
`gpt-oss:120b-cloud`, `nemotron-3-super:cloud`, `gemma4:31b-cloud` — through
the CLI gold-set runner (`gold-set:super-explorer`, SE-01 through SE-05)
against the pinned fixture worktree
(`/tmp/ollama-mcp-super-explorer-gemma-2026-09-17`), using the current
worktree's pipeline code (i.e. including the gate-condition expansion above).
Models ran one at a time, serially, respecting the free-tier one-cloud-model
limit.

| Model | Passed | SE-02 outcome |
|---|---:|---|
| `gpt-oss:20b-cloud` | 0/5 | Discovery completed but self-failed as "could not materialize evidence"; SE-04/SE-05 also hit unrelated `503` responses from the cloud endpoint. |
| `gpt-oss:120b-cloud` | 0/5 | Discovery-stage JSON schema failure — never reached evidence resolution. 4 of 5 questions overall failed at the same discovery-schema stage, worse than the 20b variant. |
| `nemotron-3-super:cloud` | 0/5 | Discovery-stage JSON schema failure — never reached evidence resolution. SE-04/SE-05 did complete but on unrelated failure modes. |
| `gemma4:31b-cloud` | 0/5 | Discovery-stage JSON schema failure — never reached evidence resolution. SE-01/03/04 completed with plausible-looking but gold-check-incomplete answers. |

**None of the four cloud models improved on their prior results, and none
exercised the gate-condition fix on SE-02** — in every case, SE-02 failed
before or during discovery, so the new `conditional` retrieval channel and
`guard_condition` evidence path were never reached for this question. The
common blocker across all four is the same discovery-stage JSON-contract
flakiness already tracked for `qwen3.5:4b` below, not missing gate
information — and it's worse here: three of the four cloud models failed the
discovery schema on the majority of their questions, where `qwen3.5:4b`
mostly clears discovery and fails later (at verification or the gold-check
phrase match). No cloud model in this pipeline is currently a viable routing
target; `qwen3.5:4b` remains the least-broken option pending a discovery
repair-retry (see below).

| Explorer | Questions passed | Outcome |
|---|---:|---|
| Super Explorer + `gpt-oss:20b-cloud` (gate-condition expansion) | 0/5 | Same profile as the earlier 20b trial; unrelated `503`s on 2 questions. |
| Super Explorer + `gpt-oss:120b-cloud` (gate-condition expansion) | 0/5 | Worse discovery-schema reliability than the smaller 20b variant on this fixture. |
| Super Explorer + `nemotron-3-super:cloud` (gate-condition expansion) | 0/5 | Regressed from 2/5 (Gemma-protocol trial above) to discovery-schema failures on SE-01/02/03 this run — likely sampling variance, not a regression from this change (no pipeline code touches discovery's schema handling). |
| Super Explorer + `gemma4:31b-cloud` (gate-condition expansion) | 0/5 | Matches its earlier 2/5-class profile qualitatively, but SE-02 itself now fails earlier (discovery schema) rather than later. |

## `num_ctx` fix: 10-model `local_explorer_task` sweep (2026-09-18/19)

Prior sessions ran `local_explorer_task` without ever setting Ollama's
`num_ctx` option, so every call fell back to Ollama's own runtime default
(4096 tokens) regardless of a model's actual context window. With a ~450-tok
system prompt plus up to 24 tool-call results at up to 6000 chars each, a
handful of file reads could silently evict earlier tool output from context
— a plausible cause for confident-but-wrong answers seen in earlier trials.
Fix applied in [`src/tools/local-explorer-task.ts`](../../src/tools/local-explorer-task.ts):
`num_ctx` is now an explicit param, default `16384`, wired into the
`options` object alongside `num_predict`. Budgets were widened to match
(`max_tool_calls` 24→32, `max_files_read` 10→14, `max_output_chars`
6000→8000, `request_timeout_ms` 180s→240s) since context is no longer the
limiter.

Ran SE-01 through SE-12 (`think: false`) against every local, non-coder,
non-embedding, non-7B model available (`qwen3.5:0.8b`, `qwen3.5:2b`,
`qwen3.5:4b`, `granite4.1:3b`, `granite4.2:3b`, `nemotron-3-nano:4b`,
`exaone-deep:2.4b`, `deepseek-r1:1.5b`, `gemma4:e2b`, `ministral-3:3b`) — one
model loaded at a time, `ollama stop` between switches, no pause needed
between repeated calls to an already-loaded model (per
[[feedback-sequential-model-benchmarks]]). Ran against a `git worktree`
pinned to the gold fixture revision (`f1a75a1`) via a standalone script
importing `runLocalExplorerTask` directly, since editing the tool's source
doesn't affect an already-running MCP server process. Scored by an automated
keyword check against each question's required symbols/values (stricter
than a human grader in some cases, e.g. penalizing a correct claim phrased
without the literal identifier — spot-checked failing "high confidence"
answers by hand and they were genuine misses, not scoring artifacts).

| Model | Passed | Avg time/question | Notes |
|---|---:|---:|---|
| `qwen3.5:4b` | 8/12 | 33.6s | Best result of the sweep. Failures: SE-01 (missed the `src/index.ts` unconditional-registration half), SE-03, SE-10, SE-11. |
| `granite4.2:3b` | 7/12 | 382.0s | Large jump from 0/5 across three prior Super Explorer-pipeline trials (see above) — but ~11x slower per question than `qwen3.5:4b`, and 3 questions (SE-01, SE-03, SE-12) burned the full 32-call budget without answering. |
| `qwen3.5:2b` | 6/12 | 18.2s | Reasonable accuracy for its size; missed SE-01/02/03/08/11. |
| `ministral-3:3b` | 6/12 | 34.3s | SE-02 gave up after 32 tool calls; otherwise comparable to `qwen3.5:2b`. |
| `gemma4:e2b` | 3/12 | 12.0s | Fast but shallow; several "low confidence" self-flags were correctly self-aware. |
| `qwen3.5:0.8b` | 1/12 | 7.1s | Too small to hold the task structure; mostly non-answers. |
| `granite4.1:3b` | 0/12 | 15.6s | Confidently wrong throughout — e.g. SE-01 answered "high confidence" citing only the function definition, never checking `src/index.ts` for the registration/enablement half the question asked for. |
| `nemotron-3-nano:4b` | 0/12 | 7.0s | Fabricates rather than calling tools — e.g. SE-03 answered "high confidence" citing `src/types.ts`/`src/request.ts`, files that don't exist in this repo, with 0 tool calls made. |
| `deepseek-r1:1.5b` | 0/12 | 5.2s | Doesn't engage the tool loop; answers are empty/near-empty with 0 tool calls. |
| `exaone-deep:2.4b` | 0/12 | 0.0s | **Not usable at all** — Ollama rejects every call with `does not support tools` (HTTP 400). Route nothing here. |

**Net effect of the `num_ctx` fix:** inconclusive as an isolated variable
(budgets changed at the same time, and there's no same-config "before"
baseline for most of these models), but `granite4.2:3b` going from 0/5 to
7/12 on the same gold set is the strongest signal that the earlier context
eviction was masking real capability — worth a controlled `num_ctx`-only
A/B on `granite4.2:3b` and `qwen3.5:4b` if this needs isolating further.
`qwen3.5:4b` remains the routing default: best accuracy and a sane latency
profile. `granite4.2:3b` is a viable fallback only when latency doesn't
matter. `exaone-deep:2.4b`, `deepseek-r1:1.5b`, and `nemotron-3-nano:4b`
should not be routed to this tool loop at all — two fail to engage it and
one lacks tool-calling support outright.

| Explorer | Questions passed | Outcome |
|---|---:|---|
| `local_explorer_task` + `qwen3.5:4b` (`num_ctx=16384` fix) | 8/12 | Best of the sweep; remains the default. |
| `local_explorer_task` + `granite4.2:3b` (`num_ctx=16384` fix) | 7/12 | Large improvement over pre-fix trials, but ~11x slower per question. |
| `local_explorer_task` + 8 other local, non-coder, non-7B models | 0-6/12 each | See per-model table above; three models (`exaone-deep:2.4b`, `deepseek-r1:1.5b`, `nemotron-3-nano:4b`) should not be routed here. |

## Budget/think A-B on `qwen3.5:4b`/`qwen3.5:2b` (2026-09-19)

Follow-up to the 10-model sweep above, narrowed to the two `qwen3.5` sizes,
testing two variables against the same SE-01..12 gold set: wider loop
budgets with `think` off, then `think` on with budgets cut back down.
`num_ctx`/`num_predict` held at 16384/8192 throughout. Ran via a standalone
script importing `runLocalExplorerTask` directly against a git worktree
pinned to the same fixture revision (`f1a75a1`), one model loaded at a time.

- **Phase 1** — `think: false`, budgets widened from the prior sweep's 32
  tool calls/14 files to 48/20 (timeout 300s).
- **Phase 2** — `think: true`, same `num_ctx`/`num_predict`, budgets cut to
  16 tool calls/8 files (timeout 360s, since thinking mode is slower per
  turn).

| Model | Phase | Passed | Avg time/question | Notes |
|---|---|---:|---:|---|
| `qwen3.5:4b` | 1 (think off, 48/20) | 8/12 | 30.9s | Failures: SE-01 (missed the unconditional-vs-conditional contrast), SE-02 (cited `.env.example` instead of the `src/index.ts` gate), SE-06 (didn't describe how the validator hook attaches), SE-11 (fabricated a "commit hash" that was actually the session's scratchpad directory name). |
| `qwen3.5:4b` | 2 (think on, 16/8) | 10/12 | 65.8s | Best single-model result across all sweeps to date. Failures: SE-08 (stated wrong hardcoded default budget values — 8/5 instead of the real 24/10 — while the core enforcement mechanism was described correctly), SE-11 (empty response after 207s, likely ran out of turns mid-answer). |
| `qwen3.5:2b` | 1 (think off, 48/20) | 5/12 | 22.3s | Failures: SE-01 (no clear citation), SE-02 (misstated which value enables the gate), SE-05 (described the mechanism vaguely, never cited `SHELL_METACHARACTERS`), SE-06 (refused, claimed it couldn't access files outside the repo root), SE-08 (lost the thread entirely — thought the file was Python), SE-10 (gave up after the full 48-call budget), SE-11 (fabricated a doc-based origin story instead of a commit hash). |
| `qwen3.5:2b` | 2 (think on, 16/8) | 7/12 | 37.5s | Improved over phase 1 despite the tighter budget. Failures: SE-01/SE-07 (gave up after 16 calls), SE-08 (same wrong-default-values issue as `4b`), SE-10 (hedged without confirming, didn't find the file), SE-11 (same fabricated-origin failure as phase 1). |

**Takeaways:**
- For both model sizes, `think: true` with a *smaller* tool-call/file
  budget outperformed `think: false` with a *larger* one — `qwen3.5:4b` went
  8/12 → 10/12, `qwen3.5:2b` went 5/12 → 7/12 — at roughly 2x the
  per-question latency. Widening the budget alone did not help; the models
  weren't running out of calls in phase 1, they were reasoning worse.
  Latency cost may not be worth it for `2b` (still below `4b`'s think-off
  score), but for `4b` this is the best result recorded for this gold set —
  worth considering as the default if the latency hit is acceptable for the
  routing use case.
- SE-11 (commit-history question) failed in 3 of 4 runs, twice via outright
  fabrication (treating an unrelated path/story as the commit) rather than
  self-flagged low confidence — this tool loop has no `git log` access, so
  it structurally cannot answer SE-11 correctly and should not be routed
  commit-history questions at all.
- SE-08 failed in phase 2 for both models on the same failure shape (correct
  mechanism, wrong hardcoded literal default values) — a new failure mode
  not seen in the num_ctx sweep above, possibly `think` mode encouraging the
  model to state specifics it's less sure of.

## `local_explorer_task` tool-calling-loop comparison (2026-09-18)

Prompted by the cloud re-test above showing every cloud model stuck at 0/5
on discovery-stage JSON schema, this session tested a different hypothesis:
that the Super Explorer pipeline's one-shot structured-JSON discovery
contract, not the models' underlying search/reasoning ability, is the
bottleneck. Control: a Haiku `Explore` subagent (real tool-calling, no
bespoke schema) already gets 5/5 on this same fixture (see the Haiku
baseline section above). Test: run the same SE-01 through SE-05 questions
through `local_explorer_task` (the existing Glob/Grep/Read tool-calling
loop, `src/tools/local-explorer-task.ts`) instead of the Super Explorer
pipeline, against the pinned fixture worktree
(`/tmp/ollama-mcp-super-explorer-gemma-2026-09-17`), for the same four cloud
models plus two local models.

**Round 1 — serial, one question at a time, default `max_tool_calls: 8`:**

| Model | Passed | Notes |
|---|---:|---|
| `gpt-oss:20b-cloud` | 1/5 | 3 gave up after 8 tool calls; 1 crashed with `Cannot read properties of undefined (reading 'tool_calls')` on SE-02 — a code bug in the tool's response handling, not a model failure. |
| `gpt-oss:120b-cloud` | 3/5 | SE-01 gave up; SE-02 partial (right core facts, one fabricated detail, self-flagged medium confidence). |
| `nemotron-3-super:cloud` | 2/5 | SE-03 correctly self-flagged low confidence (no files read); SE-01/SE-05 gave up. |
| `gemma4:31b-cloud` | 2/5 | SE-01/SE-04 correctly self-flagged low confidence (no matches found — genuine misses, not hallucinations); SE-05 partial (right allowlist mechanism, missed the `runShellTool`/`spawnSync` no-shell detail). |

Every model went from 0/5 (Super Explorer pipeline) to a real score, and
every self-reported low-confidence answer in this round was correct to
flag — no confidently-wrong hallucinations. This matches the earlier
`qwen3.5:4b` pilot finding that confidence is the one signal that tracks
correctness for this tool.

**Round 2 — parallel dispatch (all 5 questions fired in one batch, like 5
independent tasks) with `max_tool_calls` bumped 3x to 24, tested per user
request to see if concurrent calls are viable before adopting them:**

| Model | Passed | Notes |
|---|---:|---|
| `gpt-oss:20b-cloud` | 3/5 | 1 gave up (SE-03), 1 hit the same `tool_calls` crash bug (SE-04). |
| `gpt-oss:120b-cloud` | 5/5 | Clean sweep. |
| `nemotron-3-super:cloud` | 5/5 | Clean sweep. |
| `gemma4:31b-cloud` | 5/5 | Clean sweep. |

Bumping the tool-call budget and dispatching in parallel took three of four
cloud models to a full clean sweep, up from 0/5 under the Super Explorer
pipeline on the same fixture and questions. This strongly supports the
hypothesis: the pipeline's one-shot structured-JSON discovery contract was
the bottleneck, not the models' capability at "search and report."
`gpt-oss:20b-cloud` remains the weakest cloud model here, partly due to the
`tool_calls` crash bug rather than a clean capability gap.

**Round 3 — local models, same parallel-dispatch protocol, `max_tool_calls:
24`, one model loaded on GPU at a time (`ollama stop` the previous model,
`ollama run <model> "hi"` to preload the next before testing):**

| Model | Passed | Notes |
|---|---:|---|
| `granite4.1:3b` (new, first test) | 0/5 | Fabricated wholesale: 3 of 5 answers show `[0 tool call(s), 0 file(s) read]` — it never searched, and invented a plausible-looking but nonexistent Python/YAML codebase (`run_ollama_task.py`, `config/client.yaml`, `src/worker/git_wrapper.ts`). One fabricated answer was tagged **Confidence: high** — the one case in this session where the confidence signal failed to catch a hallucination. |
| `qwen3.5:4b` | 2/5 clean (SE-04/05), 1 correctly self-flagged low (SE-03), 1 wrong-and-unflagged (SE-01, falsely claimed the tool "is not present"), 1 dangerous partial (SE-02: right conclusion, fabricated supporting file citations, tagged **Confidence: high**) | Worse than its established reputation as the most reliable local model for this loop. |

Both local models did meaningfully worse than every cloud model in Round 2,
and both produced confidently-wrong output under parallel dispatch — the
opposite of the confidence signal's normal reliability. **Confound not yet
isolated:** all 5 questions were fired at once against a single
locally-loaded GPU model instance, unlike the cloud models, which have
server-side capacity to handle concurrent requests independently. It is not
yet known whether this is a genuine capability gap at 3-4b parameter count,
or whether concurrent request batching against one local GPU instance
degrades output quality (context bleed between the 5 simultaneous calls).
This needs to be resolved by re-running `qwen3.5:4b` serially (its
previously-validated mode) as a control before drawing any conclusion about
local-model viability under this protocol.

## `qwen3.5:4b` drift resolution (2026-09-18, recreated fixture)

The 2026-09-16 baseline (5/5) versus 2026-09-18 serial re-run (1/5) drift had
three candidate causes: fixture drift, prompt change, model-side variance.
Ruled out before re-running: the prompt (`local-explorer-task.ts`'s
`systemPrompt`) has been unchanged since the tool's single commit
(`5b0f7d8`, 2026-09-16 02:09); `qwen3.5:4b`'s installed digest
(`2a654d98e6fb`) has not changed either, so it's the same weights across all
three runs. The original pinned worktree
(`/tmp/ollama-mcp-super-explorer-gemma-2026-09-17`) no longer existed
(`/tmp` is ephemeral, never committed), so it was recreated fresh via
`git worktree add` at the same pinned fixture revision
(`f1a75a19d1708e36f60bba0de76714acc2343492`) to control for fixture drift.

Re-ran SE-01 through SE-05 serially (one call at a time, no model switch so
no pause needed), `qwen3.5:4b`, `max_tool_calls: 24`, against the freshly
recreated fixture:

| Q | Result |
|---|---|
| SE-01 | Fail — cited `local-explorer-task.ts` (definition site) as the registration site instead of `src/index.ts`'s unconditional call; missed the required contrast with the two gated autonomous tools; no confidence field. |
| SE-02 | Fail — correct variable→tool mapping, but cited `.env.example` instead of the actual gating code (`src/index.ts`, `registerRunCloudClaudeTask`, `registerRunLocalWorkerTask`); missed the `=== "1"` check and `local_explorer_task`'s exemption; no confidence field. |
| SE-03 | Fail — wrong default host (claimed `127.0.0.1:11434`; actual default in `ollama-client.ts` is `http://localhost:11434`); conflated the tool's own hardcoded `/api/chat` fetch with the shared `generate`/`listModels` config; confident, unflagged. |
| SE-04 | **Pass, clean** — accurate citations and trace, correctly self-flagged `Confidence: high`. |
| SE-05 | Fail — correct chaining-prevention mechanism, but misattributed the `spawnSync` call to `shell-allowlist.ts`; it's actually in `run-local-worker-task.ts`'s `runShellTool`; no confidence field. |

**1/5**, matching the 2026-09-18 serial re-run's rate (also 1/5, on a
different question that time). With both fixture drift and prompt change
independently controlled for and the low score still reproducing, **the
drift is genuine model-side variance, not fixture drift or a prompt
change.** Treat the 2026-09-16 5/5 result as an outlier, not this model's
baseline reliability, and do not trust `qwen3.5:4b` on this loop without a
larger, repeated-run sample (see the expanded-gold-set item below) before
using it as any fine-tune baseline.

## SE-06..SE-12 via Super Explorer pipeline, `qwen3.5:4b` (2026-09-18)

First scored run of the previously-unscored SE-06..SE-12 questions, via
`npm run gold-set:super-explorer -- <root> qwen3.5:4b SE-06 SE-07 SE-08 SE-09
SE-10 SE-11 SE-12` (the one-shot Super Explorer pipeline, not
`local_explorer_task`'s tool-calling loop).

**0/7 passed.**

| Q | Result |
|---|---|
| SE-06 | Fail — pipeline error: "Verification model must return exactly one result per claim in input order." |
| SE-07 | Fail — `ENOENT`: model emitted a literal placeholder path (`relative/tools/local-explorer-task.ts`) instead of a real repo-relative path. |
| SE-08 | Fail — same verification-model claim/result mismatch error as SE-06. |
| SE-09 | Fail — no crash, but gave up: "I could not materialize evidence for a supported answer," despite the discovery stage generating the right hypotheses. |
| SE-10 | Fail — pipeline error: "Evidence range exceeds file length" (bad byte-offset citation into `run-cloud-claude-task.ts`). |
| SE-11 | Fail on gold check only — found the right commit and got it `SUPPORTED` in verification, but omitted the required file-level citations (`src/index.ts`, `src/tools/local-explorer-task.ts`) and never said "feat: add local explorer tool". |
| SE-12 | Fail — gave up ("I could not materialize evidence") despite listing the exact right target (`package.json` test script) in its own hypotheses. |

Two of the seven (SE-06, SE-08) are a **pipeline bug**, not a model-quality
signal: the verification stage errors when its result count doesn't match
the claim count, before any model-quality scoring happens. SE-10 is a
related pipeline bug (bad evidence-range resolution). The other four
(SE-07, SE-09, SE-11, SE-12) are consistent with this pipeline's existing
0/5 result on SE-01..05 — same failure shape (fabricated/placeholder paths,
premature give-up despite locating the right target, and citation gaps),
same conclusion as the rest of this document: **the one-shot discovery
contract is the bottleneck, not model capability.** This extends that
finding from 0/5 to 0/12 on the full gold set for this pipeline.

Not yet done: re-running SE-06..12 through `local_explorer_task`'s
tool-calling loop (which scored 5/5 on SE-01..05) to see if the same
questions clear there — that comparison is the actual apples-to-apples test
`docs/planning/explorer-finetune-plan.md`'s Step 0 gold-set expansion needs.

## Embedder GPU contention fix + limit/timeout sweep (2026-09-19)

The Budget/think A-B sweep above (`local_explorer_task`, no embedder in its
loop) got `qwen3.5:4b` to 10/12. A parallel run of the **Super Explorer
pipeline** on the same gold set (`limit: 20`, `think: true`, default 120s
`OLLAMA_TIMEOUT_MS`) went the other way — 7/12 questions hit `timeout of
120000ms exceeded`, all in the 143-178s range (well past 120s but not
runaway). `qwen3.5:2b` on the same run mostly worked (10/12; see raw results
in [2026-09-19-sweep3-limit20-results.json](../benchmarks/runs/2026-09-19-sweep3-limit20-results.json)).

Root cause: `hybridRetrieve()` calls `embed()` (against
`nomic-embed-text-v2-moe`) before discovery's `generate()` call runs, but
neither call ever set `keep_alive`, so Ollama used its 5-minute default.
`ollama ps` during a run showed both models resident at once —
`nomic-embed-text-v2-moe` pinned at 100% GPU, `qwen3.5:4b` split
19%/81% CPU/GPU — because the embedder was still occupying GPU memory when
the much larger generation model tried to load, forcing part of it onto
CPU. The calls are sequential in code (`discovery.ts` fully `await`s
`hybridRetrieve()` before calling `generate()`), so this isn't concurrent
execution — it's GPU memory residency contention between two models that
happen to run back-to-back.

**Fix**: `embed()` in `src/ollama-client.ts` now sends `keep_alive: "0"`,
unloading the embedding model immediately after each call so it's gone by
the time the generation model loads.

**Re-verification**: reran the same SE-01..12 gold set, `qwen3.5:4b` only,
with the `limit` schema cap raised 20→40 (`explore.ts`,
`explore-repository.ts`) and `OLLAMA_TIMEOUT_MS` doubled to 240000 (both
bumped together, not to isolate which mattered — see caveat below):
**11/12 completed**, all in 24.8-92.9s — comfortably under even the old
120s timeout, let alone the new 240s one. The one failure (SE-02) was a
24.8s discovery-schema validation error ("Discovery must provide a
hypothesis or a retrieval gap"), not a timeout. Raw results:
[2026-09-19-sweep4-limit40-qwen4b-results.json](../benchmarks/runs/2026-09-19-sweep4-limit40-qwen4b-results.json).

**Caveat — timeout bump not isolated**: since every question finished well
under the *original* 120s timeout, the `keep_alive: "0"` fix looks
sufficient on its own; the `limit`/timeout doubling likely wasn't
necessary to clear the 7/12 timeout failures. Not yet re-run at
`limit: 40`/120s timeout to confirm — do that before assuming the timeout
bump is required elsewhere.

## Next session

- [x] Re-run `qwen3.5:4b` serially (one question at a time, no parallel
  dispatch) through `local_explorer_task` on the same fixture, to isolate
  whether Round 3's regression (2/5, with a high-confidence fabrication on
  SE-02) is a parallel-dispatch artifact or a genuine change from its
  established reliability. **Result (2026-09-18): 1/5 (SE-05 only), worse
  than Round 3.** SE-01 was a confident wrong answer with no confidence
  rating at all, despite having read the file containing
  `registerLocalExplorerTask`. SE-02/03/04 self-flagged `Confidence: low`
  but for the wrong reason (searched for Python/`os.environ` patterns in
  this TypeScript repo, never located the real files). Serial dispatch did
  **not** restore clean results, so the regression is not a
  parallel-dispatch artifact — treat `qwen3.5:4b`'s prior 2026-09-16
  reliability numbers as stale until re-validated; something else changed
  (fixture drift, prompt, or genuine model-side variance).
- [x] Fix the `Cannot read properties of undefined (reading 'tool_calls')`
  crash in `local_explorer_task`'s response handling (hit twice this
  session, both times on `gpt-oss:20b-cloud`) — likely an unguarded access
  when the model's response omits an expected field. **Fixed 2026-09-18**:
  `src/tools/local-explorer-task.ts` now checks `data.message` before use
  and returns a clean error (including `data.error` if present) instead of
  crashing.
- [ ] Consider whether `local_explorer_task`'s tool-calling loop should
  replace or front the Super Explorer pipeline's discovery stage, given
  Round 2's cloud-model clean sweeps versus the pipeline's 0/5 on the same
  fixture and questions — this is an architecture-level question, not a
  quick patch.
- [ ] `granite4.1:3b` should not be trusted for `local_explorer_task` as-is:
  it fabricated an entire nonexistent codebase on 3/5 questions in Round 3,
  including one under Confidence: high. Needs a serial re-test (per the
  parallel-dispatch confound above) before ruling it out entirely, but the
  high-confidence fabrication is a sharper problem than a low-confidence
  give-up.
- [ ] Discovery-stage JSON schema failures are now the dominant blocker for
  every cloud model tested (`gpt-oss:20b/120b-cloud`, `nemotron-3-super:cloud`,
  `gemma4:31b-cloud` all hit them on 60-100% of questions) — a discovery
  repair-retry (see the existing `qwen3.5:4b` verification-retry item below)
  would need to target this stage too, or SE-02's gate-condition fix can
  never be evaluated on these models.
- [x] Run `nemotron-3-super:cloud` through the Gemma protocol (adapted: MCP
  tool call instead of CLI runner, no per-question latency capture) — see
  above.
- [ ] Re-run `nemotron-3-super:cloud` and `granite4.2:3b` through the CLI
  runner with explicit per-question latency capture, matching the Gemma
  protocol exactly, if latency comparison becomes load-bearing for a routing
  decision.
- [x] Gate-condition expansion (fixes wrong-pick failures like SE-02) — see
  above. Closed as "root cause fixed, gold check still failing on unrelated
  model flakiness," not as "SE-02 passes."
- [ ] `qwen3.5:4b`'s verification-stage JSON-schema failures (`"Verification
  model must return exactly one result per claim"` / `"...one JSON object
  with results"`) are now the most common single failure reason across
  SE-01/02/04/05 in these runs. `verifyClaims` has no repair-retry the way
  `discoverEvidence` does — consider adding one, mirroring
  `runDiscoveryPass`'s one-shot repair prompt.
- [ ] The gold-set phrase/file checks require exact lowercase variable names
  in `answer_to_user`; a correct-but-paraphrased answer (e.g. "uses specific
  environment variables to enable execution") fails the check even when the
  cited evidence is right. Consider whether `synthesis.ts` should be
  instructed to name gate variables literally when citing `guard_condition`
  evidence, or whether the gold check should accept a paraphrase backed by a
  correctly-cited guard citation.
