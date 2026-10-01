# Qwen context and output comparison — 2026-10-02

A/32K remains the useful larger-input configuration: it stays entirely on GPU
and has essentially the same matched-input speed as E/16K. Keep the current
16K scout route for concise evidence; larger context has not earned a quality
routing default. Q8 showed a small latency advantage on the direct matched
prompts, with the same exact-evidence scores. No accuracy winner emerged.

Use an 8192 output ceiling for ordinary concise requests. Use 16384 for tasks
that need longer output and fit its input reserve. Neither ceiling is a target
length. Parent review remains necessary: the long response was valid JSON
with every requested record, but seven records changed source text.

## Repeated MCP scout smoke

Three repetitions of the four-question fixture per configuration; all used
thinking off and an 8192 ceiling. The model was preloaded before each run;
preloading time is excluded. First-generation initialization and prompt reuse
still affect the measurements. Model order alternated within each cache block.

| Configuration | Four-question totals, seconds | Median total | Validator selected | Reviewed complete evidence |
|---|---|---:|---:|---:|
| A | 79.2, 49.4, 79.0 | 79.0 | 7/12 | 3/12 |
| E | 79.1, 79.2, 49.3 | 79.1 | 7/12 | 3/12 |
| C | 140.3, 91.5, 25.8 | 91.5 | 6/12 | 3/12 |
| D | 96.7, 25.8, 91.2 | 91.2 | 6/12 | 3/12 |

A/E use q4_0 at 32K/16K; C/D use q8_0 at 16K/20K. All use the same Qwen
3.5 4B Q4_K_M weight layer and identical sampling. No measured smoke timeout.

The first C run was the first generation on the temporary q8 daemon; its
first prompt took 48 seconds to evaluate. Cached trials reached 26–49 seconds
for the whole fixture. Totals include different retry/expansion trajectories,
so they do not isolate cache precision. Per-question timing fields and the
small-sample empirical p95 are saved in the raw summary; these are observations,
not stable tail-latency estimates.

Source review found complete embedding keep_alive assignment/reason evidence
in each repetition. Every configuration still omitted the feature helper needed
for default gating, the cloud registration mapping, or the transaction evidence
needed for concurrent locking. Some cached q4 runs added a lock caller, which
raised validator status without making the explanation complete. All returned
smoke snippets were checked against source; indexed declaration snippets can
omit an export prefix while remaining exact source fragments. Appropriate
abstentions and parent task completion were not scored by this fixture.

## Direct-source context diagnostics

These calls bypass scout retrieval and source-quote copying. Each prompt
contains three known assignments at beginning/middle/end amid unique real
source excerpts. Three rotations move each assignment through those positions.
They are three layouts, not three repetitions of an identical capacity prompt.

Input calibration uses actual `prompt_eval_count`. The matched A/E/C/D
requests have identical prompt, system, format and thinking fields. The exact
required lines were verified present, and source-file hashes matched across
suites. Exact-line scoring checks identity, path, line and the entire copied
assignment. Location scoring excludes quote fidelity.

| Cell | Input tokens | Output ceiling | Exact lines | Correct locations | Layout times, seconds | Peak device VRAM, MiB |
|---|---:|---:|---:|---:|---|---:|
| E | 5,534 | 8,192 | 5/9 | 6/9 | 2.9, 29.4, 29.3 | 4,318 |
| A | 5,534 | 8,192 | 5/9 | 6/9 | 2.9, 29.3, 29.2 | 4,537 |
| C | 5,534 | 8,192 | 5/9 | 6/9 | 2.7, 27.7, 27.7 | 4,463 |
| D | 5,534 | 8,192 | 5/9 | 6/9 | 2.7, 27.7, 27.7 | 4,524 |
| A-expanded | 18,083 | 8,192 | 4/9 | 5/9 | 3.3, 102.7, 100.0 | 4,635 |
| D-expanded | 9,495 | 8,192 | 5/9 | 5/9 | 2.7, 47.9, 47.7 | 4,553 |
| A-16k-ceiling | 11,305 | 16,384 | 2/9 | 5/9 | 3.4, 58.0, 57.9 | 4,591 |

Every cell stayed entirely on GPU, within its input/output reserve and stopped
naturally with a short answer. The first layout follows calibration and reuses
its prompt cache; the other layouts force substantially more prompt evaluation.
The q8 matched uncached layouts took about 27.7 seconds versus 29.2–29.4 for
q4, a small observed advantage with only two layouts per configuration.

No cell returned all three exact lines. Common failures were unrelated
embedding references and altered copied punctuation. Larger inputs did not
improve completeness. A accepted 18083 input tokens on GPU; that does not
establish its maximum usable input or a quality benefit from filling the window.
The 16K-ceiling short-answer cell has different input from the 8K cells, so
its accuracy cannot isolate an output-ceiling effect.

GPU memory is total device usage, including desktop processes, sampled once
per second during generation. RAM peaks were not measured. Allocated context
size and observed input capacity are different measurements.

## Finite long-output task

A source review inventory requests every record verbatim, with no padding.
The same 36-record request was used for both ceilings at A/32K.

| Input / records | Output ceiling | Actual output | Stop | Time | Result |
|---|---:|---:|---|---:|---|
| 17080 / 48 | 8192 | 8192 | length | 200.3s | Incomplete JSON |
| 17080 / 48 | 16384 | — | infeasible | — | Input + reserve + 1024 exceeds 32K |
| 13520 / 36 | 8192 | 8192 | length | 206.3s | Incomplete JSON |
| 13520 / 36 | 16384 | 13443 | stop | 353.1s | Valid JSON, 36 records, 29 exact |

Six changed records lost a quote character; one changed an em dash into a
literal escape sequence. These are copy errors. A larger ceiling removed
truncation for this task but did not produce a fully faithful inventory.
Only one long trial per cell was run; no sustained-throughput or long-output
reliability default is established.

## Artifacts and next work

- Runner: `scripts/experimental/run-qwen-context-comparison.py`.
- Raw requests, outputs, token/timing metrics, source manifests, placement and
  device samples: ignored `benchmark-data/qwen-context/phase2/`.
- `q4/`: six valid smoke runs and an abandoned capacity pilot. The pilot's
  ambiguous JSON wrapper produced single objects; its scores are excluded.
- `q4-capacity-v2/`: schema-constrained q4 diagnostics and 48-record inventory.
- `q4-long-36/`: matched feasible output-ceiling comparison.
- `q8/`: six smoke runs and schema-constrained q8 diagnostics.
- `summary.json`: aggregates; `q8-daemon.log`: actual q8 cache/Flash Attention
  and 34/34 GPU-layer verification. `harness-q8.py` preserves that runner.

The q8 block used an isolated localhost daemon with temporary manifests and
references to existing weights. It is stopped and its temporary model store
removed. The system service remains q4_0 with Flash Attention and one slot.
The 64K tag remains retired.

Short/diagnostic/long deadlines are 120/240/600 seconds respectively. Existing
scout retries are retained in scores; calibration and interrupted pilot calls
are separate. Cache blocks ran q4 then q8 in this phase; blocks were not rotated
across independent sessions. This limits causal precision comparisons.

Next: improve deterministic packing and selection on the same held-out cases,
then rerun them. The MCP scout still explicitly requests 16K context, even
with an A model tag. Add context/budget controls before using A's larger window
through that route; `run_ollama_task` inherits the tag's context defaults.
Keep inference on GPU and concise prompt limits. The evidence failures, rather
than output truncation, are the present bottleneck for ordinary scout tasks.

Later the same day, a user-requested
[clean-load fit recheck](2026-10-02-qwen-gpu-fit.md) confirmed the 65536 spill
but found larger GPU-only windows below it. F/61440 and G/57344 are installed;
the phase-2 quality results above are unchanged.
