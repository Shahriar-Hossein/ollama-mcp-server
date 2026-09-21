# Local-worker cost-flow benchmark (2026-09-20)

## Question

Can a local worker reduce the hypothetical API cost of a parent-agent workflow once the worker's returned text also has to enter the parent's context?

This is a small protocol test on the current, uncommitted checkout. It does not measure the actual cost of this Codex session: that token accounting is not exposed here. It records Ollama's actual counters, then prices explicitly labelled hypothetical API scenarios.

## Protocol

Only `qwen3.5:4b` was used. `ollama ps` was empty before the run. The three requests were serial, with `think: false`, `num_ctx: 32768`, `num_predict: 500`, and `keep_alive: "0"`; each response unloaded Qwen before the next request. `ollama ps` was empty after completion. No cloud model ran.

| Task | Input | Intended parent use | Acceptance result |
| --- | ---: | --- | --- |
| Diff grouping | 15,276 bytes of six tracked-file diffs | Propose commit groups and subjects | Rejected. It grouped code and docs incoherently and gave multiple subjects where one was requested. The input excluded three untracked files, so it could not establish the full commit scope. |
| Scout extraction | 26,488 bytes of scout-report diff | Produce an evidence ledger | Rejected. It ended with `done_reason: length` at the 500-token cap, so the artifact is incomplete. |
| Workflow triage | 9,422 bytes of workflow diff | Flag claims needing measurement/source work | Accepted as a draft lead. Its rules and open-measurement list match the supplied document; the parent still owns source checking and decisions. |

Raw output is temporary and outside Git: `/tmp/qwen-cost-benchmark-results.json`.

## Measured local execution

Ollama's counters are exact for this run. They are Qwen tokens rather than the tokenization of a different API model, but include the text that would have to enter the parent's context.

| Task | Prompt tokens | Returned tokens | Wall | Load | Prompt eval | Generation | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Diff grouping | 4,533 | 320 | 31.4s | 3.9s | 21.2s | 6.2s | completed |
| Scout extraction | 7,402 | 500 | 50.3s | 4.2s | 36.1s | 10.0s | length-capped |
| Workflow triage | 2,181 | 404 | 21.9s | 4.2s | 10.0s | 7.6s | completed |
| **Total** | **14,116** | **1,224** | **103.6s** | **12.3s** | **67.3s** | **23.8s** | one accepted draft |

The returned 1,224 tokens are a real parent-context cost in an assisted flow; they are not free merely because Qwen ran locally.

## Hypothetical API cost model

The parent baseline uses GPT-5.6 Sol's public text rate: $4.00 per million input tokens and $20.00 per million output tokens. The worker-price scenario uses GPT-5.6 Luna's $0.20/M input and $1.20/M output rates only as a low-cost API proxy for the local worker; Qwen itself has no published API price. These are advertised rates, not a bill for this session: [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) and [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

For comparability, the direct-parent estimate assumes the parent reads the same supplied text and writes an artifact of the same length as Qwen's. The assisted-screen estimate charges the parent for every returned Qwen token, plus the hypothetical low-cost worker input/output. It does not hide output-context cost.

| Task | Direct parent proxy | Assisted-screen proxy | Difference | Valid saving? |
| --- | ---: | ---: | ---: | --- |
| Diff grouping | $0.02453 | $0.00257 | $0.02196 | No — parent must reread the original diff to repair the rejected proposal. |
| Scout extraction | $0.03961 | $0.00408 | $0.03553 | No — the capped output cannot replace source review. |
| Workflow triage | $0.01680 | $0.00254 | $0.01427 | Conditional — acceptable only as a reviewed claim-triage draft. |
| **All three, arithmetic only** | **$0.08094** | **$0.00919** | **$0.07176 (88.6%)** | **No aggregate claim:** two of three artifacts failed acceptance. |

For the accepted workflow-triage task:

```text
local-worker proxy = 2,181 × $0.20 / 1,000,000
                   + 404 × $1.20 / 1,000,000
parent receives    = 404 × $4.00 / 1,000,000
                   = $0.00254
```

The direct figure is `2,181 × $4/M + 404 × $20/M = $0.01680`. Actual API token counts and any reasoning-token charges can differ because GPT-5.6 and Qwen tokenize and reason differently. Electricity, local hardware, and Ollama-cloud charges are excluded.

## Decision

Local Qwen is useful here only for bounded, low-consequence extraction or triage with a short, checkable contract. Its returned output still costs the parent context, but a short accepted artifact can cost less than passing the full source package to a metered parent.

Do not use this result to delegate commit grouping, final diff review, security assessment, or long report extraction. In this run those routes failed their output contract or forced a reread of the source, removing the proposed saving and adding review work.

Next, benchmark a repeated CI-failure-ledger task with a fixed input, exact answer key, 200-token output cap, and recorded parent repair time. Count a saving only when the worker artifact passes acceptance without reopening the full source.

## Hot-model follow-up (2026-09-20)

At the user's request, the same Qwen model was kept resident instead of
unloaded between requests. `ollama ps` confirmed `qwen3.5:4b` was already
loaded before the test. Eight requests ran serially with `think: false`, the
resident 16,384-token context, `num_predict: 1200`, and `keep_alive: "15m"`.
No other model was loaded or used; Qwen remains resident after this run.

The larger output ceiling is a ceiling, not a requested response length. Each
prompt asked for a concise structured artifact, so the model could finish when
it had met the contract rather than fighting a low cap.

| Support task | Prompt tokens | Returned tokens | Wall | Outcome after parent review |
| --- | ---: | ---: | ---: | --- |
| Test-log summary | 2,292 | 243 | 14.8s | Accepted. It preserved both prompt time ranges and the exact binary-grep message. |
| Changed-file ledger | 4,523 | 1,200 | 44.6s | Rejected: hit the output cap before completing all files. |
| Release-note draft | 4,528 | 486 | 31.4s | Rejected: it falsely said `max_files_read` changed from 10 to 14. |
| Documentation drift | 4,525 | 39 | 22.2s | Rejected: boolean-only answer gave no evidence and was internally unhelpful. |
| Verification checklist | 4,527 | 1,200 | 45.0s | Rejected: length-capped. |
| Benchmark evidence ledger | 1,591 | 662 | 19.6s | Rejected: it added unsupported or incorrect caveats. |
| Approved-group commit subjects | 187 | 165 | 4.0s | Rejected: subjects exceeded 50 characters and the body misstated the implementation. |
| Hygiene scan | 4,539 | 230 | 26.1s | Rejected: it mistook normal diff `+`/`-` lines for conflict markers. |
| **Total** | **26,712** | **4,225** | **207.9s** | **1 accepted; 7 rejected** |

### What hot residency changed

Every request reported a load duration of about 1.2–1.7 ms (11.2 ms total),
compared with 3.9–4.2 seconds per request in the previous unload-after-each
response experiment. It materially removes cold-start latency. This is not a
quality comparison: the tasks and prompt contracts differ, and hot model
weights do not create conversational memory between stateless API requests.

### Decision after the hot run

Keep Qwen warm when performing a batch of the same-model, bounded extraction
tasks. The test-log summary is an acceptable use: it turns a log into exact,
short facts that the parent can sample-check. Do not broaden the route to
release notes, documentation analysis, evidence ledgers, commit messages, or
hygiene/security scans on this evidence. Raising the ceiling prevented some
mechanical truncation but did not make those outputs trustworthy; two tasks
still consumed all 1,200 tokens.
