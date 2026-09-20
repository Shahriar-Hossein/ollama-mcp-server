# Explorer scout comparison: Luna, Qwen, and GPT-OSS (2026-09-19)

## Purpose

Test the proposed division of labour: give a model small, read-only evidence-gathering tasks, then let a stronger parent agent compare and verify the findings. This is not a reliability benchmark. It is one live run per available model/prompt, against this checkout.

The parent decomposed “what is the difference between the basic explorer and Super Explorer?” into two identical prompts for each scout:

1. Explain how `local_explorer_task` discovers repository facts: tools, tool-loop, budgets, and confidence rule.
2. Explain how `explore_repository` / Super Explorer discovers and validates facts: stages, navigation versus reasoning, and verification rule.

Qwen used the production `runLocalExplorerTask` loop with `max_tool_calls=12`, `max_files_read=6`, `num_ctx=16384`, `num_predict=2048`, and `think=false`. Luna was a read-only Codex subagent. The assessment below treats the outputs as leads and distinguishes where parent verification remains required.

## Luna result

### Basic explorer

`local_explorer_task` is a model-driven bounded loop. The model receives `glob`, `grep`, and `read`, then either requests another tool call or writes its final answer. `glob` path-matches a repository walk; `grep` performs bounded recursive search; `read` applies root containment plus file/output limits. This was based on the then-current defaults of 24 tool calls, 10 files, and a 16,384-token context; it is not a measurement of later defaults.

Citations supplied: `src/tools/local-explorer-task.ts:23-44`, `130-175`, `203-228`, `243-267`.

### Super Explorer

`exploreRepository` is a staged pipeline: hybrid retrieval over an index; structured model hypotheses and required evidence; evidence materialization from the current repository state; commit-consistency check; strict per-claim classification as `SUPPORTED`, `CONTRADICTED`, or `INSUFFICIENT`; and synthesis of verifier-approved claims only. It can make one bounded retrieval-gap retry.

Citations supplied: `src/super-explorer/discovery.ts:203-240`, `src/super-explorer/explore.ts:97-126`, `src/super-explorer/verification.ts:140-155`.

### Luna caveat

It did not run an Ollama model: it is the parent session's read-only Codex subagent. Its account of the Super Explorer's exact index/ranking internals was explicitly left uncertain.

## Qwen 3.5 4B result (live local run)

### Basic explorer (verbatim model answer)

> Based on my analysis of `src/tools/local-explorer-task.ts`, here's how `local_explorer_task` discovers repository facts:
>
> **Available Discovery Tools:**
> 1. **glob** (line 28): Finds files by name pattern (e.g., `'src/**/*.ts'`). Returns matching relative paths.
> 2. **grep** (line 36): Searches file contents for a regex pattern. Returns matching `file:line:text`.
> 3. **read** (line 51): Reads a file's contents (optionally a line range).
>
> **How the Model Drives Them:**
> The model is invoked via Ollama API at line 226-230 with tools registered in the `TOOLS` array (lines 23-63). The model generates tool calls whose arguments are processed:
> - Line 254: If `call.function.name === "glob"`, it runs `runGlob(root, args.pattern)` via `runGlob` (lines 130-136)
> - Line 256: If `call.function.name === "grep"`, it runs `runGrep(root, args.pattern, args.path, max_output_chars)` via `runGrep` (lines 138-153)
> - Line 258: If `call.function.name === "read"`, it runs `runRead(...)` via `runRead` (lines 155-181)
>
> **Enforced Budgets:**
> - **max_tool_calls**: Default is 24 (line 203). Line 252: If exceeded, returns `(refused: tool-call budget exhausted, give your FINAL ANSWER now)`
> - **max_files_read**: Default is 10 (line 204). Line 166-167: Returns `(refused: file-read budget of ${maxFilesRead} exhausted)` if exceeded
> - **max_output_chars**: Default is 6000 (line 205). Used to truncate results (line 149 for grep, line 177 for read)
> - Line 147: Grep excludes `/node_modules/` and `/git/` entries by default
>
> **Final-Answer Confidence Rule:**
> Lines 65-77 (`systemPrompt`) encode the rule: "When done, reply with a FINAL ANSWER in this exact format... If you used most of your budget without confirming an answer via grep/read, say **Confidence: low** rather than guessing - a low-confidence answer here gets escalated to a stronger model instead of trusted as-is."
>
> This guidance is cited in line 276-278: "treat 'low' confidence as a signal to redo the search yourself or with a stronger model rather than trusting it" and notes that qwen3.5:4b's own hallucination was "correctly self-flagged low confidence."
>
> **Evidence:**
> - Discovery tools: file:28 (glob), file:36 (grep), file:51 (read)
> - Budget enforcement: file:203-204, file:167, file:253
> - Confidence rule: file:76-77
>
> `[7 tool call(s), 1 file(s) read, 55.6s]`

### Super Explorer (verbatim model answer)

> FINAL ANSWER:
> Files: src/super-explorer/discovery.ts, src/super-explorer/verification.ts, src/super-explorer/synthesis.ts, src/super-explorer/indexer.ts
> Functions/symbols: discoverCommitFacts, parseDiscoveryModelResponse, synthesizeVerifiedClaims, materializeEvidence, indexRepository, ResolutionQuality, VerificationInputClaim, DiscoveryPlan, EvidenceKind (symbol|source_range|git_commit)
> Evidence:
> - discovery.ts:78–172 – Ollama (model) performs reasoning to generate hypotheses and evidence targets from retrieved candidates; model returns strict JSON with hypotheses + retrieval_gaps.
> - discovery.ts:179+ – Prompt instructs model that retrieved candidates are unverified leads; model must not answer or assign proof, only name concrete evidence targets.
> - verification.ts:52–105 – Ollama (model) performs verification reasoning: given a claim and indexed evidence, it returns one of "SUPPORTED"/"CONTRADICTED"/"INSUFFICIENT" plus rationale and evidence_indexes; model never reads raw source directly, only queries the indexer.
> - synthesis.ts:60–78 – Reasoning step that produces final answer: only SUPPORTED claims reach the user-facing answer; other statuses are omitted (CONTRADICTED or INSUFFICIENT).
> - indexer.ts:126+ + 140–257 – Node.js performs navigation: reads git history, runs tree-sitter to parse source files and index symbols/edges; no model reasoning here.
> - discovery.ts:83–95 – Deduplication by evidence identity is deterministic (not model-based); higher-ranked occurrence wins when merging retrieval results.
>
> `[14 tool call(s), 4 file(s) read, 62.9s]`

### Qwen caveats

The basic answer was a good, directly useful map. The Super Explorer answer found the right components and central distinction, but some claims and line ranges need parent verification before use. It also consumed 14 calls despite the requested 12-call limit: the current implementation refuses calls *after* incrementing past the limit and waits for the model to end the conversation. This is an observed harness behaviour, not evidence that Qwen respected the requested budget.

## GPT-OSS 20B cloud result

The user explicitly approved sending the two bounded prompts and repository-derived search excerpts to the Ollama cloud endpoint. The model ran through the same production `runLocalExplorerTask` protocol and the same 12-tool-call, 6-file budget as Qwen.

### Basic explorer prompt (verbatim result)

> Gave up after 12 tool calls without a final answer.

### Super Explorer prompt (verbatim result)

> Gave up after 12 tool calls without a final answer.

### GPT-OSS caveat

This is a failure to produce a usable result in the basic explorer's current `glob`/`grep`/`read` loop, not a general finding that the cloud model cannot reason about this repository. There is no final answer, file citation, or intermediate transcript to inspect because the production loop retains only the terminal error in this case. It also does not reproduce the model through the Super Explorer production pipeline; that would be a separate test.

## GPT-OSS 20B cloud retry: 50-call budget

The two identical prompts were retried with only `max_tool_calls` changed from 12 to 50. The 6-file, output, context, prediction, and per-request-timeout limits remained the same.

### Basic explorer prompt (verbatim result)

> **FINAL ANSWER**
> **Files**: `src/tools/local-explorer-task.ts`
> **Functions/symbols**: `glob`, `grep`, `read`, `systemPrompt`, `runLocalExplorerTask`
>
> **Evidence**
> - Discovery tools exposed to the model: `glob` defined at `src/tools/local-explorer-task.ts:27-30`, `grep` at `src/tools/local-explorer-task.ts:35-42`, and `read` at `src/tools/local-explorer-task.ts:50-60`.
> - System prompt (lines 66-75) instructs the model that it “has three read-only tools: glob, grep, read” and must “get at most ${maxToolCalls} tool calls total and may read at most ${maxFilesRead} files.”
> - Default budgets are set in `runLocalExplorerTask` (lines 203-205) and in the parameter schema (lines 283-284): `max_tool_calls` defaults to 24, `max_files_read` defaults to 10.
> - Model drives the discovery loop by generating tool calls via the Ollama chat API (request at `src/tools/local-explorer-task.ts:226-238`) and the code processes each call in the handler loop (`src/tools/local-explorer-task.ts:248-260`).
> - Final-answer confidence rule: the comment at `src/tools/local-explorer-task.ts:276-278` states “treat ‘low’ confidence as a signal to redo the search yourself or with a stronger model rather than trusting it,” and the system prompt (line 77) reinforces that a low-confidence final answer should be escalated.
>
> **Confidence**: high
>
> `[20 tool call(s), 2 file(s) read, 70.2s]`

### Super Explorer prompt (verbatim result)

> **Files**
> - `src/super-explorer/discovery.ts`
> - `src/super-explorer/verification.ts`
> - `src/super-explorer/synthesis.ts`
>
> **Functions / symbols**
> - `discoverEvidence` (Discovery stage)
> - `verifyClaims` (Verification stage)
> - `synthesizeVerifiedClaims` (Synthesis stage)
>
> **Evidence**
> - `discovery.ts` defines the model response format and a constraint that the plan must contain at least one hypothesis or a retrieval gap, showing that the LLM is used only to *propose* evidence-required hypotheses (lines 16-22).
> - `verification.ts` defines the verification schema with a `verification_status` field that can be `SUPPORTED`, `CONTRADICTED`, or `INSUFFICIENT` and uses the LLM to evaluate each claim with supplied evidence (lines 37-55).
> - `synthesis.ts` contains a deterministic synthesis routine that filters for claims whose status is `SUPPORTED`, builds citations from the evidence records (lines 48-53), and constructs the final answer only from those supported claims, omitting unsupported or insufficient ones (lines 54-70).
>
> **Confidence**: high
>
> `[49 tool call(s), 6 file(s) read, 152.4s]`

### What changed

The 50-call budget converted both terminal failures at 12 calls into final answers. It does not show that 50 is the necessary threshold: this test has not tried intermediate budgets such as 24 or 32. The Super Explorer answer is directionally useful but incompletely answers the requested navigation-versus-reasoning distinction, so its high self-confidence is not enough to use it without parent verification.

## Parent comparison

| Scout | Basic-explorer findings usable as a lead? | Super-Explorer findings usable as a lead? | Parent work still required |
| --- | --- | --- | --- |
| Luna | Yes | Yes | Verify citations and resolve implementation details outside its stated scope. |
| Qwen 3.5 4B | Yes | Partly | Check every cited claim/line range and correct overstatements before acting. |
| GPT-OSS 20B cloud (12 calls) | No | No | Both runs exhausted the budget without returning an answer. |
| GPT-OSS 20B cloud (50 calls) | Yes, with citation verification | Partly | It completed both, but used 20 and 49 calls respectively; the latter remained incomplete for the full task. |

## Answer to the original engineering question

Yes: these findings are enough for the parent to work on selected parts. The safe boundary is **scouting**: identify likely files, functions, stage boundaries, and terms to verify. They are not enough to hand off an architectural change, performance claim, or security decision without checking the cited code.

For this question, a parent can already use the results to start a concise comparison: the basic explorer lets the model navigate `glob`/`grep`/`read` directly under budgets and returns a self-confidence label; Super Explorer makes navigation and evidence materialization deterministic, has the model propose structured hypotheses, verifies claims independently, and synthesizes only supported claims. The parent should verify Qwen's detailed implementation wording before publishing that comparison.

## 50-call budget: pros and cons

**Pros**

- It recovered two otherwise empty GPT-OSS runs, producing cited leads the parent can verify.
- It gives a slower model room to correct an unproductive early search path rather than failing at a fixed small cutoff.
- The basic prompt completed in 20 calls, so a 50-call ceiling is a maximum rather than a guaranteed cost.

**Cons**

- Worst-case latency increased materially: 70.2 seconds for the basic prompt and 152.4 seconds for the Super Explorer prompt in this one retry. That is too slow for an interactive default in many workflows.
- A larger budget does not ensure a complete or correct answer: the 49-call Super Explorer answer omitted part of the requested distinction despite `Confidence: high`.
- It permits more repeated or malformed exploration steps. This retry emitted a binary-file grep notice and an invalid grep-pattern notice before finishing.
- For a cloud model, each extra tool turn sends more repository-derived context to the provider and consumes more cloud capacity.

For now, treat 50 as an **escalation budget**, not the global default. A more economical next experiment would retry only an unanswered 12- or 24-call run at 32, then 50, and record whether the additional calls add verified claims rather than merely a final answer.

## Seven-model 50-call comparison trial

### Protocol

One identical combined task was sent to each model through the production `runLocalExplorerTask` loop:

> Compare the basic `local_explorer_task` with `explore_repository` (Super Explorer) in this repository. Give concise source-cited evidence for: (1) each system’s discovery method, (2) navigation versus model reasoning, (3) budgets or verification guarantees, and (4) the most important operational difference. Use the read-only tools to confirm facts; do not guess. End in the required FINAL ANSWER format.

Every trial set `max_tool_calls=50`, `max_files_read=6`, `max_output_chars=5000`, `num_ctx=16384`, `num_predict=2048`, `think=false`, and a 120-second per-chat-request timeout. One local and one cloud model ran concurrently for the first three pairs; the fourth cloud model ran after the pairs. `granite4.2:3b` is the installed Granite choice.

### Measured outcomes

| Model | Location | Terminal result | Actual reported calls | Wall time | Parent assessment |
| --- | --- | --- | ---: | ---: | --- |
| `qwen3.5:2b` | local | Returned prose, not the required final format | 30 | 98.8s | Not usable: it invented `src/super-explorer/tools/local-explorer-task.ts` and said it needed further checking. |
| `ministral-3:3b` | local | Final answer | 10 | 42.4s | Partly useful, but not safe as-is: it incorrectly said the basic explorer has “no model reasoning.” |
| `granite4.2:3b` | local | Per-request timeout; no final answer | unavailable | 309.7s | Not usable in this run. The production terminal error does not retain an exact prior tool-call count. |
| `gemma4:31b-cloud` | cloud | Final answer | 8 | 15.0s | Best speed/call count in this trial. Its central comparison is correct enough to serve as a verified lead. |
| `nemotron-3-nano:30b-cloud` | cloud | Final answer, medium confidence | 27 | 31.6s | Useful lead; mostly correct but broad and reliant in part on documentation rather than primary implementation. |
| `nemotron-3-super:cloud` | cloud | Final answer | 28 | 85.2s | Partly useful. It used this benchmark document as evidence, so it is not independent source-only reconnaissance. |
| `gpt-oss:120b-cloud` | cloud | Final answer | 37 | 44.0s | Partly useful. It captured the main difference, but incorrectly described `discoverEvidence` as deterministic and occurring before model reasoning. |

The reported call counts are emitted by the production loop only after a final answer. Granite's error path reports only the timeout, so this table intentionally does not substitute the 50-call ceiling for an unknown actual count.

### Parallel schedule and elapsed time

| Batch | Concurrent models | Batch duration |
| --- | --- | ---: |
| 1 | `qwen3.5:2b` + `gemma4:31b-cloud` | 98.8s |
| 2 | `ministral-3:3b` + `nemotron-3-nano:30b-cloud` | 42.4s |
| 3 | `granite4.2:3b` + `nemotron-3-super:cloud` | 309.7s |
| 4 | `gpt-oss:120b-cloud` | 44.0s |
| **Total elapsed** | **seven single trials** | **494.9s (8m 15s)** |

### Cost-efficiency limits

Tool calls and elapsed time are not monetary cost. The local Ollama runs reveal no energy price or hardware amortization. The installed Ollama cloud tags did not return token counts or a per-token charge, so this experiment cannot calculate their dollar cost.

Luna's earlier read-only subagent run also did not expose input/output token accounting, so its exact hypothetical API cost is unknown. Using the published GPT-5.6 Luna text rates of $0.20 per million input tokens, $0.02 per million cached-input tokens, and $1.20 per million output tokens, its cost would be:

```text
USD = input_tokens × 0.00000020
    + cached_input_tokens × 0.00000002
    + output_tokens × 0.00000120
```

For scale only, a hypothetical 10,000-input-token and 1,000-output-token Luna call would cost about **$0.0032** before any tool-specific fees. That is an illustrative calculation, not the cost of the earlier Luna subagent. The official [GPT-5.6 Luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna) provides the current rates.

### What this does and does not support

At a 50-call ceiling, Gemma 31B Cloud is the strongest observed cost-efficiency candidate for this exact one-question protocol: it completed in 8 calls and 15 seconds. That is a single trial on an in-repo question, not evidence to change routing defaults. The local candidates were materially slower and less reliable here; Granite's timeout is especially important. The cloud answers still need source verification, because high confidence and a final-answer format did not prevent factual mistakes.

## Recommended scout configuration for this task

### Winners

- **Local winner: `ministral-3:3b`, conditionally.** It was the only local candidate in this trial to return a complete final answer quickly (10 calls, 42.4 seconds). Its false “no model reasoning” claim means it is acceptable only as a scout whose citations are checked by the parent or a verifier; it is not a trustworthy final-answer model.
- **Cloud winner: `gemma4:31b-cloud`.** It returned the most useful answer with the fewest calls (8) and shortest time (15.0 seconds). Apply the same citation check before acting on it.

### Suggested budget

Use **16 tool calls and 6 distinct-file reads** for the first attempt on this comparison-shaped discovery task. Both winners completed inside 16 calls. If the model returns no final answer or low confidence, allow **one 32-call retry**; then escalate to a stronger parent or the Super Explorer instead of routinely spending 50 calls.

The 50-call ceiling is useful for diagnosis, but is too expensive as the default: it did not make Qwen 2B reliable, Granite timed out, and GPT-OSS 120B still made a factual error after 37 calls.

## Qwen 3.5 4B rerun after adding ast-grep (2026-09-20)

This is one repeat of the original two-prompt Qwen protocol after adding the
read-only `ast_grep` tool. It ran serially against the dirty checkout at
`b53f77095dacfc7faff7f4517fd412e0e3212035`; the raw terminal results are in
[`benchmark-data/explorer-scout/2026-09-20-qwen35-4b-ast-grep-scout-raw.json`](../../../benchmark-data/explorer-scout/2026-09-20-qwen35-4b-ast-grep-scout-raw.json).
It is a changed-source, single-run comparison, not evidence that ast-grep
caused an improvement or regression.

| Prompt | Requested budget | Reported result | Prior Qwen result | Assessment |
| --- | --- | --- | --- | --- |
| Basic explorer | 12 calls, 6 files | Final answer; 7 calls, 1 file, 51.9s | 7 calls, 1 file, 55.6s | It correctly identified the fourth `ast_grep` tool and the active budgets. It incorrectly called the loop “2-turn”; the loop permits up to `max_tool_calls + 2` model turns and any number of tool calls returned in a turn. |
| Super Explorer | 12 calls, 6 files | Low-confidence final answer; 13 calls, 0 files, 21.0s | 14 calls, 4 files, 62.9s | Not usable: it falsely reported that the Super Explorer source was absent. Its low-confidence label worked as intended. |

Both prompts used `model=qwen3.5:4b`, `max_tool_calls=12`,
`max_files_read=6`, `max_output_chars=6000` per tool response,
`num_ctx=16384`, `num_predict=2048` per chat turn,
`request_timeout_ms=180000` per chat request, and `think=false`. The reported
13 calls on the second prompt is the existing accounting behaviour: the loop
increments the counter before rejecting call 13, so at most 12 tool actions
are executed but the terminal summary includes the refused request.

The terminal summary does not record tool names, so this run does not show
whether Qwen actually invoked `ast_grep`; it only shows that Qwen discovered
and described it after reading the implementation. A dedicated structural
query benchmark with per-tool telemetry is required before claiming a benefit
from the new tool.

## Clean 50-call, thinking-enabled rerun (2026-09-20)

One Qwen run was launched under a detached `flock`-protected supervisor and
polled through its ignored log, so no other scout benchmark overlapped it.
Raw result and log are kept outside git in
[`benchmark-data/explorer-scout/2026-09-20-qwen35-4b-think-50call-8k-scout-clean-raw.json`](../../../benchmark-data/explorer-scout/2026-09-20-qwen35-4b-think-50call-8k-scout-clean-raw.json)
and
[`benchmark-data/explorer-scout/2026-09-20-qwen35-4b-think-50call-8k-scout-clean.log`](../../../benchmark-data/explorer-scout/2026-09-20-qwen35-4b-think-50call-8k-scout-clean.log).

| Prompt | Result | Assessment |
| --- | --- | --- |
| Basic explorer | 8 calls, 2 files, 79.0s | Correctly describes the four tools and active limits, but violates the required final-only format and again incorrectly says one tool call is processed per turn. |
| Super Explorer | 23 calls, 6 files, 173.3s | A high-confidence, source-cited answer that correctly describes the deterministic navigation/model-reasoning split and the three verification states. |

The protocol was `qwen3.5:4b`, `max_tool_calls=50`, `max_files_read=6`,
`max_output_chars=8000`, `num_ctx=32768`, `num_predict=8192`, and
`think=true`. Total reported wall time was 252.3 seconds. It is better than
the 12-call thinking-off trial on the Super Explorer prompt (which returned a
low-confidence false absence claim), but not a controlled attribution of the
improvement to any one setting.

`ministral-3:3b` was then run serially with the same protocol, but Ollama
rejected both prompts because that tag does not support `think=true`; this is
a compatibility result, not a quality measurement. Its ignored raw result and
log are
[`benchmark-data/explorer-scout/2026-09-20-ministral-3b-think-50call-8k-scout-clean-raw.json`](../../../benchmark-data/explorer-scout/2026-09-20-ministral-3b-think-50call-8k-scout-clean-raw.json)
and
[`benchmark-data/explorer-scout/2026-09-20-ministral-3b-think-50call-8k-scout-clean.log`](../../../benchmark-data/explorer-scout/2026-09-20-ministral-3b-think-50call-8k-scout-clean.log).

### Tools that would improve scout output

The current `glob`/`grep`/`read` loop makes the model rediscover basic navigation and lets it search generated/binary or self-authored benchmark material. Add small, read-only deterministic tools rather than more open-ended model turns:

| Tool or guard | Why it helps this task |
| --- | --- |
| `list_files(root, extensions, exclude)` | Gives a bounded source-only tree for `src/`, avoiding guessed paths and broad globs. |
| `search_code(query, roots, literal_or_regex)` | Searches only source roots, skips binaries and generated/output directories, and returns exact `path:line` hits. This addresses the binary grep noise observed in several runs. |
| `outline_file(path)` | Returns exported functions/classes and line ranges before a full read, so the scout can choose the relevant function. |
| `read_symbol(path, symbol)` | Supplies only the implementation of `runLocalExplorerTask` or `exploreRepository`, rather than large files or approximate line ranges. |
| `verify_citations(citations)` | Deterministically confirms that every claimed `file:line` exists and contains the cited symbol/text before the model's answer is returned. |
| Source-scope guard | Exclude `node_modules`, `.git`, `.super-explorer`, generated files, and prior benchmark/run documents unless the task explicitly asks about them. This prevents the self-referential evidence seen in the Nemotron Super run. |

These tools should return bounded excerpts and retain the existing repository-root containment checks. They improve evidence quality without granting shell access or write capability.
