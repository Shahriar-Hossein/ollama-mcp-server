# Proposed project improvements

These are recommendations only. Application code and existing documents were left unchanged.

## 1. Make the savings path real

`summarize_output` accepts the whole source as a string. If the parent first reads a large log and then supplies it as the argument, that source has already entered the parent's interaction. The tool cannot retroactively remove that cost. Its description's claim that the full source never needs to enter the caller's context is only true with an upstream mechanism that supplies the source without exposing it to the parent.

Suggested next feature: accept a bounded, authorized **artifact reference** for logs/files, read it inside the bridge, and return a compact summary plus exact critical excerpts, source line references and a truncation flag. A test runner can write a log artifact and return only its reference/exit status. Resolve paths against an authorized workspace and impose file/input limits. Prefer a file reader to adding arbitrary shell execution.

Use a parser for stable log formats. For messy sources, preserve an exact error ledger alongside the model summary so compression cannot silently erase the decisive failure. This is likely more useful than replacing every worker model.

## 2. Add small execution controls and evidence

| Priority | Current observation | Proposed change |
|---|---|---|
| High | `generate()` returns only response text. | Preserve completion status, token counts, timings, model/digest and truncation. Return a short result to the parent; save detailed evidence locally. |
| High | No request queue; several MCP processes can use one daemon. | Serialize local work across clients and enforce one resident model. Use a separate bounded cloud queue; do not silently choose a local model after a cloud limit. |
| High | Local worker fetch has no explicit deadline, HTTP-status check or response validation. | Add total-job/request deadlines, bounded turns/tool calls, output limits and a validated response shape. Confirm cancellation before starting a replacement model. |
| High | Native tool calls are executed without checking the function name. | Validate name and argument schema, reject unknown tools, and distinguish malformed responses from a completed task. |
| Medium | Shared client hardcodes `think:false`; callers cannot set budgets. | Keep that as the small-task default, but allow validated task profiles for context, output cap, schema and model-supported thinking settings. Avoid assuming every model accepts the same thinking controls. |
| Medium | Cloud harness uses blocking `spawnSync` for up to ten minutes. | Use asynchronous process handling with a controlled deadline and bounded output if retaining the harness. The local command executor also blocks for up to 30 seconds. |
| Medium | Error messages largely collapse failures into connectivity. | Separate access/quota, missing model, invalid request, timeout, malformed response and incomplete generation. Retry only safe transient cases, not autonomous mutations. |

Keep this a thin bridge: a few task profiles and a small result envelope are sufficient. A general autonomous-agent framework is unnecessary.

## 3. Reduce autonomous git scope before increasing turns

The existing [delegation benchmark](../delegation-benchmark-2026-09-14.md) records a real scope failure: a later worker committed a file left staged by an earlier failed worker. Raising the turn budget did not fix task ownership.

Do **not** implement the old document's suggestion to reset or unstage unrelated work automatically. That changes the user's index. Prefer isolated disposable repositories/worktrees for experiments; for real work, explicitly verify allowed paths and index state, refuse unexpected staged changes, and validate the resulting commit's exact file list. A deterministic git operation is often better than asking a model to discover commands repeatedly.

The existing shell-metacharacter rejection and direct argv execution in the local worker are valuable. However, the parser only restricts the git **subcommand**, not its options:

- `git diff --output=...` can write a file; “diff is read-only” is not a sufficient policy. [Git diff](https://git-scm.com/docs/git-diff)
- `git commit --amend --no-edit` changes existing history; allowing `commit` does not imply permission to amend. [Git commit](https://git-scm.com/docs/git-commit)
- The CJS validator allows malformed hook JSON to exit successfully. A validation boundary should fail closed.
- The cloud hook checks a command string which the Claude Bash tool still executes through its own shell. It does not convert the invocation to direct argv execution. Shell expansion and option/path semantics need their own review; the local worker's guarantee does not automatically transfer.
- Git hooks/configured external helpers and Read/Glob/Grep scope need explicit treatment. A cwd and a prompt saying “stay here” are not filesystem isolation.

These are static review findings, not executed exploits. Use fixed operations with bounded flags/paths, robust token parsing, and an isolated execution environment where appropriate. Keep both validators synchronized and both autonomous tools opt-in. Add targeted tests for their security invariants before extending autonomy; this has higher value than a broad cosmetic test suite.

## 4. Separate model capability from harness choice

`run_ollama_task` can already send a cloud tag through the signed-in local service. Use it for a self-contained cloud draft. Use the lightweight native tool loop only when the task needs tools. Use the Claude harness when its actual capabilities justify its larger input and round trips.

The cloud worker accepts an arbitrary model string despite its name, so it could launch a local model through the expensive harness. Conversely the local worker accepts arbitrary model strings. Validate routing against explicit model metadata/policy, not just a `:cloud` suffix: installed cloud tags use both `:cloud` and `-cloud` forms.

A model that claims it committed something has not proved success. A harness exit code also does not establish task completion. Verify artifacts independently. Preserve this practice from the existing experiments.

## 5. Correct documentation drift in a later change

Use this review as the current checkpoint; preserve older experiments as historical evidence and annotate superseded operational claims later.

- README's “missing model,” hardcoded host, missing timeout/discovery and missing tsconfig observations are stale. Current code has installed `qwen2.5-coder:3b` defaults, `OLLAMA_HOST`, a 120-second shared-client timeout, `/api/tags` discovery, `think:false`, and `tsconfig.json`.
- AGENTS.md's statements that there is no call timeout or model-discovery tool conflict with the shared client and registered tool. The local worker's lack of request timeout is a separate issue.
- Correct `gemma4:31b:cloud` to the installed `gemma4:31b-cloud`. A tag's presence in `/api/tags` does not establish signed-in status, free entitlement or remaining quota.
- Remove “zero parent quota,” proportional quota-minutes saved, and “local is instant” claims unless backed by measurements. Preserve local generation timings as timings.
- Reconcile the earlier positive 10-second git result with later stalled and out-of-scope runs. Both happened; the first is not an enduring reliability guarantee.

## Next actionable step

In a future code session, implement artifact-based log summarization plus a compact validated result and metrics. Separately benchmark `qwen3:4b-instruct` on held-out tasks. Keep autonomous git experiments isolated until operation scope and completion checks are enforced. Material uncertainty remains: no end-to-end parent subscription savings, long-context reliability, or new-candidate quality was measured in this review.
