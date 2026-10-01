# Local model context and MCP improvement checklist

Date: 2026-10-01. Updated: 2026-10-02. Status: repeated smoke, controlled capacity diagnostics and output-ceiling tests complete; MCP improvements pending.

Keep Qwen 3.5 4B Q4_K_M weights fixed. Compare `q4_0` KV cache at
32K with `q8_0` KV cache at 16K/20K, then push each cache type
toward its largest usable context. Test usable evidence quality, prompt capacity, and latency on the
actual machine. Treat 8K as an optional diagnostic control, not the target.
Keep frontier-model planning and review; the local explorer returns source
evidence and missing information.

## 1. Record the starting point

- [x] Check installed models: `qwen3.5:4b` is present, ID `2a654d98e6fb`,
  listed size 3.4 GB. Use the same model digest for both KV-cache types.
- [x] Inspect the current smoke runner and scout: generation uses
  `num_ctx: 16384`, `num_predict: 2000`; evidence packing has a
  24,000-character cap. The runner accepts model names and `--think`,
  but no context-size option.
- [x] Inspect telemetry: shared `generate()` returns text and discards
  Ollama's token counts and timing fields.
- [x] Verify Q4 quantization: installed `qwen3.5:4b` reports Q4_K_M.
- [ ] Record Ollama version, model tags/full digests, template, sampling
  parameters, OS, GPU/VRAM, RAM, and available memory. The pasted context
  reports a GTX 1660 Super with 6 GB; GPU access was not verified here.
- [ ] Record current daemon settings and a restore procedure before changes.
- [ ] Freeze repository SHA, working-tree changes, fixture version, and
  index state for comparisons.

## 2. Compare these configurations

Q4/Q8 below refer to **KV-cache quantization**. Model weights remain
Q4_K_M in every row. Context is the total input/output window, not an
input-only allowance.

| Run | KV cache | Explicit `num_ctx` | Purpose |
|---|---|---:|---|
| A | q4_0 | 32768 | Main larger-context candidate |
| B (retired) | q4_0 | 65536 | CPU offloading; excluded for speed |
| C | q8_0 | 16384 | Higher cache precision candidate |
| D | q8_0 | 20480 | Initial Q8 extension |
| E | q4_0 | 16384 | Matched-context control against C |
| F | q4_0 | 61440 | Clean-load GPU-only extension; less fit margin |
| G | q4_0 | 57344 | GPU fit margin reference |
| H | q4_0 | 50000 | Current testing baseline; 25000 output ceiling |

- [ ] Keep model digest, thinking off, sampling, tool schema, retrieval,
  and inference concurrency identical. Compare equal output ceilings first;
  sweep output budgets separately.
- [ ] Configure one inference at a time. Verify Flash Attention and the
  selected KV-cache type in the running daemon, not just the client shell.
- [ ] Run cache configurations in separate daemon-setting blocks. Restart
  and verify the effective setting when switching cache type; record it
  with each artifact. Rotate block order across repetitions.
- [ ] Record GPU/CPU placement and peak VRAM/RAM during each run. A loaded
  model is not proof that the configuration fits entirely on the GPU.
- [ ] Increase context progressively for both cache types beyond the initial
  rows where feasible. Record the largest repeatedly usable window and
  the first failing or impractically slow step; do not assume Q8 stops at 20K.
- [ ] Preserve failed results before lowering context or changing budgets.

### Output capacity and requested result length

- [ ] Make `num_predict` configurable. Test ceilings of 8192 and 16384
  generated tokens; retain 2000 as the current control.
- [ ] Treat these as ceilings, not target lengths. Allow an early natural
  stop when the task is complete; do not pad results to use the budget.
- [ ] Give the prompt a task-specific result limit, such as at most three
  evidence references per question part plus a short unresolved list, or
  a maximum word count for summaries. Record the limit and score compliance.
- [ ] Keep ordinary evidence-selection tasks concise. Add separate tasks
  that genuinely need long output to test sustained 8K/16K generation.
- [ ] Record actual output tokens, completion reason, schema completeness,
  repetition, citation quality, and requested-length compliance. Hitting a
  ceiling with incomplete JSON is a failure, not usable capacity.
- [ ] Fit each output ceiling to the context budget. A 16K window cannot
  reserve 16K output and still hold a useful prompt; mark incompatible
  cells as infeasible or increase context explicitly.
- [ ] For example, at 32K context, reserving 8K output and a 1K safety
  margin leaves at most 23K input. Reserving 16K leaves at most 15K input.
- [ ] Measure latency/deadlines for long-output cases separately. Prompt
  length instructions guide the model; API ceilings and validation enforce
  bounded generation and acceptable results.

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

- [ ] Add explicit context, output-ceiling, requested-result-length, and
  input-budget controls to
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
  fit the smallest usable input budget. Use C versus E with equal output
  ceilings to isolate KV-cache quantization.
- [ ] Expanded-input suite: use the extra capacity in A/B and score whether
  added evidence improves results. Mark prompts that cannot fit C/D.
- [ ] Add held-out large-project questions with known required files,
  symbols, lines, and relationships. Include multi-part questions, similar
  names, irrelevant context, negative cases, and cross-file callers.
- [ ] Separate retrieval failures (required evidence absent from the packed
  prompt) from selection failures (present but omitted or misused).
- [ ] Run at least three measured repetitions per question/configuration;
  separate cold loads and warmed runs and rotate cache-block order.
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
| A: q4_0 KV / 32K | 1458–4291 | 3/12 complete | 0 unsupported snippets | 0 | 18.2s / 28.3s | smoke peaks unmeasured | 100% GPU |
| B: q4_0 KV / 64K | retired | excluded | — | — | — | — | CPU offloading |
| C: q8_0 KV / 16K | 1458–4285 | 3/12 complete | 0 unsupported snippets | 0 | 14.4s / 58.5s | smoke peaks unmeasured | 100% GPU |
| D: q8_0 KV / 20K | 1458–4285 | 3/12 complete | 0 unsupported snippets | 0 | 14.3s / 42.7s | smoke peaks unmeasured | 100% GPU |
| E: q4_0 KV / 16K | 1458–4291 | 3/12 complete | 0 unsupported snippets | 0 | 18.3s / 28.2s | smoke peaks unmeasured | 100% GPU |

The table above is the phase-2 smoke suite: 12 questions per active row,
including retries. Median/p95 are per-question empirical observations. Direct
capacity and output-ceiling cells are in the reviewed phase-2 report.

- [ ] Create a result row per cache/context/output-ceiling combination;
  include actual output tokens, requested result limit, stop reason, and
  length compliance alongside the columns above.
- [ ] Choose acceptable latency and failure limits before the full run.
- [ ] Report denominators, repeated-run variation, and failure categories;
  retain raw artifacts and keep reruns separate.
- [ ] Select the default using useful evidence and task completion within
  those limits. Record a larger-context fallback if it earns its extra cost.
- [ ] Update relevant docs/defaults only after source-reviewed results.

Current next step: add MCP context/budget controls and improve evidence
packing, then rerun the same cases. Initial and repeated A/C/E comparisons are complete. B is retired. The active comparisons found no complete-evidence advantage
from extra context or q8 cache precision on these cases.

## Execution checkpoints

The [initial A–E smoke report](experimental/benchmarks/runs/2026-10-02-qwen-context-smoke.md)
preserves the 2000-token controls and the 64K CPU-offloading result.
The following checkpoints describe current settings and completed phase-2 work.

### Retirement and output ceilings (2026-10-02)

B/64K retired at user request because CPU offloading is unacceptable. Its
installed tag was removed; Modelfile and benchmark evidence are retained.
Active A/C/D/E tags, scout and smoke runner now default to `num_predict=8192`.
The initial 2000-token runs remain baseline controls, not high-ceiling tests.
Keep concise prompt instructions; 8192 is a maximum, not a requested length.
Test 16384 separately at A/32K with an appropriate input reserve. Do not
reserve 16384 output in a 16384 context. Future capacity steps must remain
fully on GPU; exclude any CPU-offloaded configuration.

### Phase 2 complete (2026-10-02)

See [reviewed results](experimental/benchmarks/runs/2026-10-02-qwen-context-phase2.md).

- Three four-question repetitions each for A/E/C/D at an 8192 ceiling.
  Reviewed complete evidence: 3/12 per configuration; useful partial evidence
  remains separate from complete answers. All active configurations stayed on GPU.
- Matched 5534-token source prompts: identical exact-line scores (5/9).
  Q8 uncached layouts were about 1.5 seconds faster; precision did not improve
  accuracy. Prompt reuse strongly affects smoke timings.
- A accepted 18083-token input on GPU, with about 100 seconds for uncached
  processing and no complete three-line answer. Capacity is not evidence quality.
- Same 36-record inventory, 13520 input tokens: 8192 ceiling truncated JSON;
  16384 ceiling stopped naturally at 13443 tokens with 36 records, 29 exact.
- Raw artifacts are under ignored `benchmark-data/qwen-context/phase2/`.
  The ambiguous wrapper pilot is preserved and excluded from comparison.
- Temporary q8 daemon stopped; temporary weight references removed. System
  service remains q4_0 with Flash Attention and one inference slot. B remains retired.
- Keep the current 16K scout default for concise evidence. A/32K is available
  for larger inputs; the scout's explicit 16K override needs context/budget
  controls before its route can use that window.
- Next: improve evidence packing/selection, then rerun held-out cases. More
  output allowance did not resolve short-answer evidence omissions. Independent
  cache-block rotation, wider held-out tasks and parent-work measurements remain.

## Clean GPU fit recheck — 2026-10-02

User requested a clean 64K retest and a GPU-only extension within 45–65K.
No other Ollama model was resident before each probe. 65536 still spills;
63488 fits on three fresh loads, while 64512 and 65024 spill. F/61440 and
G/57344 are installed, keeping weights and the 8192 ceiling fixed. Prefer G
for more fit margin. This extends placement capacity, not evidence quality
or the scout's explicit 16384 override. See the
[clean-load report](experimental/benchmarks/runs/2026-10-02-qwen-gpu-fit.md)
for the runner's reserved-memory calculation and larger-prompt validation.

User subsequently selected H (`qwen-context:h-q4_0-50k`) as the baseline
for further testing: exactly 50000 total context and 25000 output ceiling.
With a 1024 margin, reserve the full ceiling only for inputs up to 23976
tokens. Inherited settings and short generation were verified at 100% GPU;
full 25000-token output remains untested. Existing scout/wrapper overrides
need matching explicit settings when testing H.

Subsequently, the user removed A/E/F/G model tags and retained only H among
q4 context variants. B was already absent. C/D q8 tags and base
`qwen3.5:4b` remain. Historical Modelfiles and benchmark results are preserved;
`configurations.json` marks A/B/E/F/G removed.

Q8 follow-up: 32768 context passed three independent clean GPU-only loads
and a 5528-token source prompt. No lower-context sweep was necessary.
See [q8 placement report](experimental/benchmarks/runs/2026-10-02-qwen-q8-gpu-fit.md).
The maximum remains unmeasured. System q4/H restored; C/D defaults unchanged.

Final configuration cleanup: only H/q4_0/50000 and I/q8_0/32768 context
variants are retained, each with a 25000 output ceiling. A–G tags and
Modelfile folders were deleted. Base `qwen3.5:4b` remains; historical
measurements above are unchanged. KV precision requires the matching daemon.
