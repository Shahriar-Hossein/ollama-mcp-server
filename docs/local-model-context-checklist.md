# Local model context and MCP improvement checklist

Updated: 2026-10-05. Active work focuses on H; I comparisons are paused.

H now uses `qwen-context:h-q4_0-50k`, with saved 50000 context and 16000
output tokens. The old 64K name is a compatibility alias with these same limits. The 64K load spilled during the first scout request; the
[placement diagnosis](experimental/benchmarks/runs/2026-10-05-h-cpu-placement.md)
records the reason and lower-context checks. Selection now returns complete source-backed evidence for all
four development questions in three runs, both at the saved output ceiling
and at the new 2048 scout reserve. This does not establish held-out quality.
See the [H-only improvement report](experimental/benchmarks/runs/2026-10-05-h-improvements.md).

## Active H-only work

- [x] Add source-reference shortlists for each evidence requirement and a
  schema restricted to supplied refs. Retain checked partial citations across
  the bounded retry; require an actual competing-worker rejection.
- [x] Apply default output reserves: 8192 for delegation/summaries, 2048 for
  both scouts, capped by the saved finite ceiling. Explicit overrides remain
  available. H input allowances are 40784 and 46928 respectively, before
  charging prompt overhead. The output ceiling is unchanged; context was lowered from 64000 to 50000.
- [x] Report prompt/system/schema/template byte charges and calibrate actual
  MCP handler requests using sanitized synthetic code, logs, Unicode and JSON.
  Keep the conservative byte bound; these samples do not justify a universal
  bytes-to-tokens conversion.
- [ ] Next: add matching-tokenizer accounting to recover feasible input
  capacity at 50K without silently truncating source. The earlier 49912-byte
  log request now exceeds the 40784 delegation/summary allowance.
- [ ] Test held-out multi-part questions and negative cases on another
  repository, scoring completeness, irrelevant citations and abstentions.
- [ ] Capture sanitized representative Codex/Claude request shapes to extend
  calibration; synthetic inputs do not measure full caller/session overhead.

Historical context/output tests are linked below. The
[fresh ceiling sweep](experimental/benchmarks/runs/2026-10-03-context-ceiling.md)
verified tiny-prompt clean loads near 66K, not full-window generation. The
[H/8192 test](experimental/benchmarks/runs/2026-10-03-h-8k-output.md) truncated
a long inventory; [64 Ki/16384](experimental/benchmarks/runs/2026-10-03-h-64k-16k-output.md)
completed it with one altered record and mixed placement. Saved H's 16000
ceiling still needs a sustained long-output fidelity test.

## Current configurations

On 2026-10-03, H changed from 50K to 64000 context and 16000 output
tokens. On 2026-10-05 it returned to 50000 context after the 64K load
offloaded two layers. The 16000 output ceiling and sampling are retained.

Both variants use the same Qwen 3.5 4B Q4_K_M weights and template.
Q4/Q8 below describe **KV-cache precision**, not weight quantization.
Context is the total input/output window. Output ceilings are maxima;
request concise results unless the task requires long output.

| Tag | KV cache | Context tokens | Output ceiling | Input budget with full output reserve and 1024 margin |
|---|---|---:|---:|---:|
| `qwen-context:h-q4_0-50k` | q4_0 | 50000 | 16000 | 32976 |
| `qwen-context:i-q8_0-32k` | q8_0 | 32768 | 25000 | 6744 |

- [x] Install H/I and verify inherited context/output parameters.
- [x] Delete A–G context tags and Modelfile folders. Retain base
  `qwen3.5:4b` (ID `2a654d98e6fb`, full digest in raw artifacts).
- [x] Keep Modelfiles, registry and setup README under
  `/home/shahriar/ollama-models/qwen-context/` consistent with H/I only.
- [x] Verify GPU placement for H/50000 and q8/32768.
- [ ] Test sustained generation with the 16000 output ceiling on H and
  25000 on I;
  short inherited-default checks do not verify full-ceiling generation.
- [ ] Compare useful evidence and parent task completion on H/I before
  choosing a quality-based routing default.

## Runtime and budget requirements

Ollama 0.34.3, GTX 1660 SUPER with 6 GB VRAM. The system daemon currently
uses q4_0 KV, Flash Attention enabled and one inference slot. Its benchmark
override is `zz-qwen-benchmark.conf`; inspect all service overrides before
changing or restoring settings. Administrator changes require user sudo.
Temporary q8 daemons and weight references were removed after testing;
H was restored on the system daemon.

2026-10-02 review follow-up: effective service settings still show q4_0;
`zz-qwen-benchmark.conf` overrides `override.conf`'s q8_0 setting. This
mismatch changes I's actual cache precision. The four smoke rejections happen
at the input-budget check with zero generation calls, before cache loading.
Reproduced against installed H/I settings with generation stubbed: all four
I requests overflow; H reaches the stub for all four. Input byte bounds are
8392–14394 against I's 6744 budget. Raw results are in ignored
`benchmark-data/review-cleanup/2026-10-02-budget-check.json`.

- KV precision is a daemon setting. A q8-named tag on a q4 daemon still
  uses q4 cache. Verify `OLLAMA_KV_CACHE_TYPE`, Flash Attention and one slot
  in effective settings and runner logs before each cache block.
- Unload the prior model and verify an empty model list before clean tests.
  Check `ollama ps` after loading; reject CPU placement for GPU-only work.
  Other GPU activity can change a future load's placement.
- Enforce `input tokens + reserved output tokens + safety margin <= num_ctx`.
  Input includes system text, template, schema, question, source and history.
  Reduce the reserved ceiling explicitly when larger input is needed.
- Local MCP routes inherit saved context. Output defaults use the documented
  tool reserves above; explicit `num_ctx`/`num_predict` fields override them. H is the
  operational default on the current q4 daemon, not a quality winner.
  Models without saved finite limits use reported 16384/8192 fallbacks.
- Input checks use a conservative UTF-8 byte bound over system, schema,
  question/source/history and template, plus a 1024-token margin. It is not
  a calibrated tokenizer. Oversized requests return `input_overflow`; the
  24000-character packing cap also reports overflow rather than generating
  from silently omitted source. The historical I/25000 reserve rejected all four smoke bundles before
  generation. That is not the new 2048 scout reserve.
- The smoke runner supports `--num-ctx` and `--num-predict`; pass
  `50000/25000` for H or `32768/25000` for I with the matching daemon cache.
  These are explicit overrides; without them it uses production context/tool reserves
  and records effective options, requests and raw token/timing metrics.
- Keep experimental tools opt-in, target sources read-only and autonomous
  worker flags independent.

## Completed measurements

### GPU fit

See the [q4 clean-load report](experimental/benchmarks/runs/2026-10-02-qwen-gpu-fit.md)
and [q8 placement report](experimental/benchmarks/runs/2026-10-02-qwen-q8-gpu-fit.md).
These verify placement and selected prompt sizes, not maximum full-window
capacity or evidence quality.

- [x] Retest q4/65536 with no other Ollama model resident: still spills,
  33/34 GPU layers. Overlap is not required to reproduce the failure.
- [x] Bracket the observed q4 boundary: 63488 passed three clean GPU-only
  loads; 64512 and 65024 spilled. The exact threshold is unmeasured.
- [x] Test q4/57344 with 36134 uncached input tokens: natural READY response,
  252.4 seconds, all 248 samples GPU-only, peak device usage 5017 MiB.
- [x] Preserve q4/61440's 240-second timeout on that input. All 236 samples
  stayed GPU-only, peak device usage 5208 MiB; no completed answer was returned.
- [x] Test q8/32768 on three clean loads: 34/34 GPU layers, q8 K/V buffers
  totaling 544 MiB. A 5528-token source prompt completed in 27.7 seconds.
  It returned extra evidence despite the READY-only instruction; this was
  a placement test, not a semantic correctness pass. No downward sweep was needed.
- [ ] Measure the q8 maximum only if needed; 32768 is a verified window.

The q4 runner reserves memory for the vision component even on text calls;
its fit calculation missed the free-memory target by only 23–29 MiB near
64K. Device free memory alone does not predict layer placement. GPU-only
means model placement, not zero host RAM/CPU work or 100% GPU utilization.

### Evidence quality and output capacity

Historical A–E labels refer to deleted configurations. See the
[initial smoke controls](experimental/benchmarks/runs/2026-10-02-qwen-context-smoke.md)
and [reviewed phase-2 results](experimental/benchmarks/runs/2026-10-02-qwen-context-phase2.md).

- [x] Run three four-question smoke repetitions for A/E/C/D at an 8192
  ceiling. Source-reviewed complete evidence was 3/12 per configuration.
  Other cases omitted default-helper, cloud-mapping or locking-transaction
  evidence. Validator success is not semantic correctness.
- [x] Compare identical 5534-token source prompts: all configurations scored
  5/9 exact lines and 6/9 locations. Q8 uncached layouts were slightly faster;
  no accuracy winner emerged. Prompt reuse strongly affects smoke timings.
- [x] Test A/32768 with 18083 input tokens entirely on GPU, about 100 seconds
  uncached. More context did not improve exact-evidence completeness.
- [x] Compare the same 36-record inventory, 13520 input tokens: 8192 ceiling
  truncated JSON; 16384 stopped naturally at 13443 tokens, valid JSON,
  all 36 records, 29 exact. Six records lost a quote character and one
  changed a Unicode character. Valid JSON is not faithful copying.

Direct-source diagnostics bypass scout retrieval and quote copying. Their
quote errors do not show that the scout invents copied snippets. Three
positional layouts are not three repeats of one prompt. Cache-block order
was not rotated across independent sessions. RAM peaks, wider held-out
projects and parent follow-up work remain unmeasured.

## Historical backlog (H/I comparisons paused)

The [first implementation pass](experimental/benchmarks/runs/2026-10-02-scout-evidence-budget-fix.md)
is complete. All required helper, tool-mapping and transaction source reaches
all four bundles. The final H run returns complete evidence for 2/4 cases;
tool guards and the locking rejection/caller remain selection failures.
The H-only follow-up above supersedes these selection/output-budget priorities.
Input accounting remains conservative. Do not infer an H/I quality winner.

- [x] Add production MCP context/output/input-budget controls and record
  effective values. Preserve the shared text-returning `generate()` API;
  expose raw token/timing metrics through the smoke benchmark path.
- [ ] Account for actual prompt overhead. Capture sanitized representative
  requests from Codex/Claude and calibrate estimates with `prompt_eval_count`.
  Session context is not automatically forwarded to Ollama.
- [x] Merge overlapping source windows, deduplicate shared bundles and charge
  repeated source once. Preserve question parts, paths and evidence IDs;
  return explicit overflow instead of generating from omitted source.
- [x] Separate retrieval failures from selection failures on the four current
  cases: the saved final bundles contain every required source element.
- [ ] Repeat matched H/I inputs within I's input reserve, then test larger H
  inputs separately. Check beginning/middle/end evidence and exact citations.
- [ ] Add finite tasks that need longer output. Record actual tokens, stop
  reason, completeness, fidelity, repetition and requested-length compliance.
  Keep timeout results separate from retries and changed-deadline cells.
- [ ] Rotate cache blocks and separate fresh loads from prompt reuse. Freeze
  SHA, working-tree changes, fixture/index state and sampling per comparison.
  Record peak device/RAM usage and declared latency/failure limits.
- [ ] Expand to held-out large projects, multi-part/cross-file questions and
  negative cases. Score supported answers and appropriate abstentions separately.
- [ ] Add bounded adaptive exploration only when evidence is missing: at most
  three rounds with total token/action/time budgets; validate paths, evidence
  IDs and ranges, copy quotes from source and report unresolved parts.
- [ ] Compare deterministic retrieval, current scout and adaptive scout on
  equal budgets. Measure parent follow-up work before claiming savings.

## Artifacts and verification

- Runner: `scripts/experimental/run-qwen-context-comparison.py`.
- Ignored phase-2 raw artifacts: `benchmark-data/qwen-context/phase2/`.
  `q4/` smoke is valid; its ambiguous-wrapper pilot is excluded.
  Corrected diagnostics: `q4-capacity-v2/`; long comparison: `q4-long-36/`;
  q8 comparisons: `q8/`; aggregate: `summary.json`.
- Clean q4 placement scripts/results: `benchmark-data/qwen-context/gpu-fit/`.
- Clean q8 placement script/log/results: `benchmark-data/qwen-context/q8-gpu-fit/`.
- Current checks: 14 scout, 12 model-budget, 3 feature and 8 Quality Review
  tests pass. Whitespace checks pass. Standard TypeScript checking remains
  blocked by missing `vitest` in an existing experimental test; a temporary
  config excluding only that test checks the remaining source and smoke CLI.
- New raw requests/results and source-presence audit:
  `benchmark-data/qwen-context/evidence-budget-fix/`. H v1/v2 are intermediate
  implementations, not repetitions of final H v3. I's four overflow results
  are budget refusals, not model accuracy failures. Its short q8 settings/GPU
  check passed; the temporary daemon/store were removed and H restored.
- Launch long benchmarks under one detached `setsid nohup flock -n`
  supervisor with an ignored log. Confirm a complete artifact and released
  lock before the next model. Checkpoint failures and retain raw metrics.
