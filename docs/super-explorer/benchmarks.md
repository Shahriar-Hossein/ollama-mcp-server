# Super Explorer — initial benchmark set

This is the first, deliberately small gold set for the repository. It tests
the exploration work this server actually needs: locating symbols, following
registration and configuration paths, checking a security boundary, finding a
bounded control flow, and retrieving a relevant introduction commit. It is not
a model-capability benchmark and is separate from the worker benchmarks in
[`docs/BENCHMARKS.md`](../BENCHMARKS.md).

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
| SE-09 | What is the default model for local exploration, and what evidence justifies treating low-confidence results as untrusted? | `src/tools/local-explorer-task.ts`: `DEFAULT_MODEL`, `systemPrompt`, `registerLocalExplorerTask`; `docs/benchmarks/local-explorer-2026-09-16.md` | The default is `qwen3.5:4b`. The prompt requires a confidence field and says low confidence instead of guessing; the public tool description directs callers to redo low-confidence searches rather than trust them. The benchmark document records the pilot limitation. |
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
