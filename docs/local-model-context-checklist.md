# Local model context and MCP improvement checklist

Date: 2026-10-01. Status: planned; no comparison results yet.

Compare Qwen 3.5 4B Q4 weights at 32K/64K with Q8 weights at
16K/20K. Test usable evidence quality, prompt capacity, and latency on the
actual machine. Treat 8K as an optional diagnostic control, not the target.
Keep frontier-model planning and review; the local explorer returns source
evidence and missing information.

## 1. Record the starting point

- [x] Check installed models: `qwen3.5:4b` is present, ID `2a654d98e6fb`,
  listed size 3.4 GB. No Qwen 3.5 4B Q8 tag was listed on 2026-10-01.
- [x] Inspect the current smoke runner and scout: generation uses
  `num_ctx: 16384`, `num_predict: 2000`; evidence packing has a
  24,000-character cap. The runner accepts model names and `--think`,
  but no context-size option.
- [x] Inspect telemetry: shared `generate()` returns text and discards
  Ollama's token counts and timing fields.
- [ ] Verify Q4 quantization with model metadata; do not infer it from size.
- [ ] Record Ollama version, model tags/full digests, template, sampling
  parameters, OS, GPU/VRAM, RAM, and available memory. The pasted context
  reports a GTX 1660 Super with 6 GB; GPU access was not verified here.
- [ ] Obtain and verify the Q8 build of the same base model.
- [ ] Record current daemon settings and a restore procedure before changes.
- [ ] Freeze repository SHA, working-tree changes, fixture version, and
  index state for comparisons.

## 2. Compare these configurations

Q4/Q8 below refer to **weight quantization**. KV-cache quantization is a
separate variable. Begin with the same `q8_0` KV setting in every row.

| Run | Weights | Explicit `num_ctx` | Purpose |
|---|---|---:|---|
| A | Q4_K_M | 32768 | Main larger-context candidate |
| B | Q4_K_M | 65536 | Capacity and long-context quality |
| C | Q8_0 | 16384 | Higher weight precision candidate |
| D | Q8_0 | 20480 | Push Q8 to the requested 20K |
| E | Q4_K_M | 16384 | Matched-context control against C |

- [ ] Keep thinking off, output budget, sampling, tool schema, retrieval,
  and inference concurrency identical. Save effective settings, including
  model defaults, rather than assuming they match.
- [ ] Configure one inference at a time. Verify Flash Attention and
  `q8_0` KV cache in the running daemon, not just the client shell.
- [ ] Record GPU/CPU placement and peak VRAM/RAM during each run. A loaded
  model is not proof that the configuration fits entirely on the GPU.
- [ ] If a row fails or is too slow, record that result before changing it.
  Try `q4_0` KV only as a separately labeled second experiment.
- [ ] Probe intermediate Q8 windows only after C/D; record the largest
  window that passes repeated capacity and quality checks.

Ollama documents per-request `num_ctx`, GPU placement via `ollama ps`,
Flash Attention, and the global KV-cache setting in its
[FAQ](https://docs.ollama.com/faq). Confirm support on the installed version.

## 3. Handle real prompt overhead

Codex/Claude session context is not automatically copied into an Ollama
request. Measure what each MCP route actually forwards or constructs.
Large delegated questions and accumulated tool results can still consume
the local model's window.

- [ ] Capture sanitized, representative delegation requests from both
  Codex and Claude: short lookup, large-project lookup, and long task brief.
- [ ] Account for system prompt, model template, schema/tool definitions,
  question, repository evidence, history, and reserved output tokens.
- [ ] Make the invariant explicit:
  `input tokens + reserved output tokens + safety margin <= num_ctx`.
- [ ] Use model-compatible token accounting where available; character
  counts are estimates. Compare estimates with actual `prompt_eval_count`
  and record any truncation or uncertainty.
- [ ] Preserve the question, constraints, source paths, and evidence IDs.
  Deduplicate repeated instructions and source excerpts before packing.
- [ ] Return an explicit budget/overflow result or repack deterministically;
  never silently discard essential constraints or evidence.
- [ ] Add beginning/middle/end evidence checks to detect lost context.
- [ ] Reserve room for output and follow-up tool results; do not fill the
  entire window with the initial prompt.

## 4. Prepare the benchmark harness

- [ ] Add explicit context and input-budget controls to
  `scripts/experimental/run-local-explore-repo-smoke.ts`; pass them through
  the scout and record effective values, not a hardcoded protocol label.
- [ ] Parameterize evidence packing separately from `num_ctx`. Raising
  the window with the same small prompt only tests allocation overhead.
- [ ] Preserve raw API metrics in a benchmark path without breaking the
  existing text-returning `generate()` callers.
- [ ] Save prompt/output token counts, prompt-eval/generation durations,
  load time, wall time, retry count, timeouts, and rejected citations.
- [ ] Checkpoint each question, including failures; save sanitized request
  metadata and outputs under ignored `benchmark-data/`.
- [ ] Launch long runs using one detached `setsid nohup flock -n`
  supervisor and log. Confirm completion and released lock before the next
  model. Use one explicit deadline policy; do not mix timeout retries into
  original-run scores.

## 5. Separate capacity from task quality

- [ ] Run the existing four-question smoke fixture first. It is a harness
  check, not sufficient evidence for a routing default.
- [ ] Capacity suite: progressively fill each window with realistic code,
  instructions, and search results while retaining known required evidence.
- [ ] Matched-input suite: give every configuration the same prompts that
  fit the smallest window. Use C versus E to isolate weight quantization.
- [ ] Expanded-input suite: use the extra capacity in A/B and score whether
  added evidence improves results. Mark prompts that cannot fit C/D.
- [ ] Add held-out large-project questions with known required files,
  symbols, lines, and relationships. Include multi-part questions, similar
  names, irrelevant context, negative cases, and cross-file callers.
- [ ] Separate retrieval failures (required evidence absent from the packed
  prompt) from selection failures (present but omitted or misused).
- [ ] Run at least three measured repetitions per question/configuration;
  separate cold loads and warmed runs and rotate configuration order.
- [ ] Review exact citations and semantic sufficiency against source.
  A successful HTTP response, valid JSON, or abstention is not a correct
  answer. Score appropriate abstentions separately on negative cases.

## 6. Improve the MCP after measuring the baseline

Change one behavior at a time and rerun the same fixtures.

- [ ] First improve prompt accounting, deduplication, and evidence packing.
- [ ] Add bounded adaptive exploration only when missing evidence calls
  for it: up to three rounds of search/read/symbol/reference/caller/callee
  actions, with explicit total-token, action, and time budgets.
- [ ] Validate paths, evidence IDs, and source ranges on every expansion;
  copy returned quotes from source and report unresolved question parts.
- [ ] Compare deterministic-only retrieval, current scout, and adaptive
  scout on the same questions and total budgets.
- [ ] Log sanitized trajectories: question, SHA, settings, searches,
  reads, selected evidence, fallback reason, and outcome. Parent follow-up
  reads, changed files, and tests need separate parent-side instrumentation.
- [ ] Measure parent follow-up reads and whether the evidence lets the
  parent complete the task. Do not claim savings without measurements.
- [ ] Keep experimental registration opt-in, target sources read-only,
  and autonomous-worker flags independent. Training and editing remain
  later work, after the evaluation is stable.

## 7. Record results and choose a default

| Configuration | Actual input tokens | Useful evidence / cases | Invalid citations | Timeouts | Median / p95 time | Peak VRAM / RAM | CPU/GPU placement |
|---|---|---|---|---|---|---|---|
| A: Q4 / 32K | pending | pending | pending | pending | pending | pending | pending |
| B: Q4 / 64K | pending | pending | pending | pending | pending | pending | pending |
| C: Q8 / 16K | pending | pending | pending | pending | pending | pending | pending |
| D: Q8 / 20K | pending | pending | pending | pending | pending | pending | pending |
| E: Q4 / 16K | pending | pending | pending | pending | pending | pending | pending |

- [ ] Choose acceptable latency and failure limits before the full run.
- [ ] Report denominators, repeated-run variation, and failure categories;
  retain raw artifacts and keep reruns separate.
- [ ] Select the default using useful evidence and task completion within
  those limits. Record a larger-context fallback if it earns its extra cost.
- [ ] Update relevant docs/defaults only after source-reviewed results.

Next step: add context/budget controls and benchmark telemetry, then run
A/C/E as the first comparison. The open question is whether the additional
capacity in B or precision in C/D improves evidence enough to justify its
memory and latency on this machine.
