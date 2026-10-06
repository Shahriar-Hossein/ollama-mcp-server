# Local model context and MCP improvement checklist

Updated: 2026-10-06. Active work focuses on H; I comparisons are paused.

H now uses `qwen-context:h-q4_0-24k`, with saved 24576 context and 16000
output tokens. The retained 50K tag is an explicit larger-context option.
The [desktop GPU report](experimental/benchmarks/runs/2026-10-06-h-desktop-gpu.md)
records why 50K and 32K can spill and the verified 24K loads. GPU residency
under other desktop workloads still needs checking. Current evidence selection
remains incomplete; see the [operation-scoping checkpoint](experimental/benchmarks/runs/2026-10-06-h-operation-scoping.md).

## Active H-only work

- [x] Add source-reference shortlists for each evidence requirement and a
  schema restricted to supplied refs. Retain checked partial citations across
  the bounded retry; require an actual competing-worker rejection.
- [x] Apply default output reserves: 8192 for delegation/summaries, 2048 for
  both scouts, capped by the saved finite ceiling. Explicit overrides remain
  available. H/24K input allowances are 15360 and 21504 respectively, before
  charging prompt/schema overhead. The 16000 saved output ceiling is unchanged.
- [x] Report prompt/system/schema/template byte charges and calibrate actual
  MCP handler requests using sanitized synthetic code, logs, Unicode and JSON.
  Keep the conservative byte bound; these samples do not justify a universal
  bytes-to-tokens conversion.
- [x] Add matching-tokenizer accounting for H generation using its installed
  GGUF vocabulary, Qwen35 BPE and renderer framing. Preserve byte fallback,
  schema reserve, explicit output ceilings and overflow refusal. All four
  live calibration counts match; the 49912-byte log is accepted at 21007
  tokens and passes its exact-output contract.
- [x] Expose generation completion/token/timing metadata and explicit bounded
  deadlines on delegation/summaries. Report length stops as incomplete with
  partial text retained; keep the 120-second default.
- [x] Test frozen multi-part and negative questions on a source snapshot of
  another repository. Complete evidence: 0/2 positives; safe unresolved
  status: 0/2 negatives before the fix. Nearby citations falsely passed
  despite explicit unresolved requirements; the wrapper now requires review.
- [x] Add bounded caller/callee/import expansion, preserve retrieved chain
  files across parts, and require missing call/configuration elements.
  Previous positives now select complete evidence in 2/2 development cases;
  the newly frozen synthetic screen completes 2/2 positives and safely
  abstains on 2/2 negatives. This is not independent real-repo held-out quality.
- [x] Add named caller identity and direct object provider/use checks; test
  aliases, shadowing, competing providers and unresolved member implementations.
- [x] Freeze independently authored questions on a fresh real-source slice.
  Complete minimum evidence: 0/3 positives; appropriate status: 2/2 negatives.
  One negative retains a distractor, and two incomplete positives still return
  `evidence_selected`. These are open gaps, not broader reliability evidence.
- [x] Improve natural question decomposition and source windows within large
  methods. Require review for unchecked completeness; freeze new source-slice
  questions. Development improves to 2/3 complete minimum selections, but fresh
  exact-rubric positives remain incomplete. See the [multi-step report](experimental/benchmarks/runs/2026-10-06-h-multistep-evidence.md).
- [x] Add operation-driven provider search hints and explicit image conditions.
  The missing adapter now supplies 11/11 development requirements, selecting
  10/11. Fresh exact-rubric positives remain 0/2 complete; the negative safely
  requires review but retains a distractor. See the [provider/condition report](experimental/benchmarks/runs/2026-10-06-h-provider-conditions.md).
- [x] Recognize negated operation requests and provider-name phrasing; preserve
  condition/fallback windows and bind branch/error citations to the requested
  method. Reused development positives complete 1/2 minimum citation sets; the
  absent-file path still omits its guarded upload assignment.
- [ ] Freeze structurally different validation questions from another repository
  before further evidence-selection tuning.
- [ ] Capture sanitized representative Codex/Claude request shapes to extend
  calibration; synthetic inputs do not measure full caller/session overhead.

Current evidence work: [operation scoping](experimental/benchmarks/runs/2026-10-06-h-operation-scoping.md).
Earlier work: [caller/provider checks and real-source screen](experimental/benchmarks/runs/2026-10-06-h-relationships.md).
Earlier improvement: [cross-file retrieval and selection](experimental/benchmarks/runs/2026-10-06-h-cross-file-evidence.md).
Earlier results: [tokenizer, held-out evidence and sustained output](experimental/benchmarks/runs/2026-10-05-h-tokenizer-heldout.md).
The two negative development reruns now require review. The inventory stops
naturally at 13446 output tokens with 35/36 exact records; it ran on a mixed
post-reboot runner. GPU-only long-output fidelity remains unverified.

Historical context/output tests are linked below. The
[fresh ceiling sweep](experimental/benchmarks/runs/2026-10-03-context-ceiling.md)
verified tiny-prompt clean loads near 66K, not full-window generation. The
[H/8192 test](experimental/benchmarks/runs/2026-10-03-h-8k-output.md) truncated
a long inventory; [64 Ki/16384](experimental/benchmarks/runs/2026-10-03-h-64k-16k-output.md)
completed it with one altered record and mixed placement. Saved H's 16000
ceiling has now been exercised in the current report above.

## Current configurations

On 2026-10-03, H changed from 50K to 64000 context and 16000 output
tokens. On 2026-10-05 it returned to 50000 context after the 64K load
offloaded two layers. On 2026-10-06 H moved to 24576 as the desktop default; 50K remains explicit.
The 16000 output ceiling and sampling are retained.

The variants use the same Qwen 3.5 4B Q4_K_M weights and template.
Q4/Q8 below describe **KV-cache precision**, not weight quantization.
Context is the total input/output window. Output ceilings are maxima;
request concise results unless the task requires long output.

| Tag | KV cache | Context tokens | Output ceiling | Input budget with full output reserve and 1024 margin |
|---|---|---:|---:|---:|
| `qwen-context:h-q4_0-24k` (default) | q4_0 | 24576 | 16000 | 7552 |
| `qwen-context:h-q4_0-50k` (explicit) | q4_0 | 50000 | 16000 | 32976 |
| `qwen-context:i-q8_0-32k` | q8_0 | 32768 | 25000 | 6744 |

- [x] Install H/I and verify inherited context/output parameters.
- [x] Delete A–G context tags and Modelfile folders. Retain base
  `qwen3.5:4b` (ID `2a654d98e6fb`, full digest in raw artifacts).
- [x] Keep Modelfiles, registry and setup README under
  `/home/shahriar/ollama-models/qwen-context/` consistent with the current H default and retained explicit profiles.
- [x] Verify repeated H/24576 GPU-only loads under bounded desktop memory pressure.
  Previous H/50000 and q8/32768 observations remain historical evidence.
- [x] Test H sustained generation with the 16000 ceiling: 13446 output
  tokens, valid 36-record JSON, 35/36 exact records, 500 seconds. Power loss
  interrupted the first attempt; the separate retry used mixed placement.
- [ ] Verify H sustained long output on a fresh GPU-only runner under the
  current desktop workload at the new 24K default. Earlier 50K runs used mixed placement.
- [ ] Test sustained generation at I's 25000 ceiling if I work resumes.
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
- H generation input uses matching GGUF/Qwen35 accounting, plus schema bytes
  and the 1024-token margin. Unsupported models/settings, thinking, unavailable
  vocabularies and tokenizer-limit failures retain UTF-8 byte accounting;
  the legacy chat scout also retains it. Oversized requests return `input_overflow`; the
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
Byte fallback remains conservative. Do not infer an H/I quality winner.

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
- [x] Add an H finite inventory needing longer output. Record actual tokens, stop
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
- Current checks: 38 scout/relationship/operation, 17 model-budget/tokenizer, 3 feature,
  8 Quality Review and 2 grader CLI tests pass. Whitespace checks pass. Standard TypeScript checking remains
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
