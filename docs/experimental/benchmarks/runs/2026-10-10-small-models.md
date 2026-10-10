# Small local models on the 2026-10-10 tests

Same T1–T7 as [the qwen/gpt-oss run](2026-10-10-qwen9b-vs-4b.md). Rebuilt harness (original not saved); it reproduces H's earlier row exactly.

## Setup

- GTX 1660 Super 6GB, q8_0 KV daemon. `num_ctx` 32768, output 8192 (code) / 2048 (scout), thinking off.
- Code tests use temp 0.2, top_p 0.9, top_k 40, seed 42. Scout tests use the tool's defaults.
- Sequential, 20 s pause between models. Single run per cell, so treat small gaps as noise.
- Models: `gemma4:e2b`, `exaone-deep:2.4b`, `ministral-3:3b`, `granite4.2:3b`, `nemotron-3-nano:4b`. H is the baseline.
- `granite4.1:3b` was in `ollama list` earlier but returned 404 at run time (gone). Not tested.

## Results

| Test | H (baseline) | gemma4:e2b | ministral-3:3b | granite4.2:3b | nemotron-3-nano:4b | exaone-deep:2.4b |
|---|---|---|---|---|---|---|
| T1 | 5/9, +19 | input_overflow | input_overflow | input_overflow | input_overflow | 0/9, selects nothing |
| T2 | abstain, 20 junk | abstain, 12 junk | abstain, 15 junk | input_overflow | abstain, 20 junk | selects nothing |
| T3 | 7/9 | **9/9** | 0/9 | syntax error | 6/9 | HTTP 500 |
| T4 | fail (3/7) | fail (3/7) | fail (3/7) | fail (no compile) | fail (1/7) | HTTP 500 |
| T5 | 5/5 | 5/5 | 5/5 but cites forbidden `"inline"` line | 5/5 | 5/5 | 0/5 |
| T6 | pass | pass | pass | **fail** (not a Map) | pass | HTTP 500 |
| T7 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 0/5 |
| **Clean passes** | 3 | **4** (T3, T5, T6, T7) | 2 | 2 | 3 | 0 |

Latency is mostly 2–20 s on code tests and 35–65 s on T1/T2, in line with H.

## Findings

- No model beats H on the hard tests. All fail T4 and all but gemma overflow or fail T1.
- gemma4:e2b is the only standout: ties H on everything and is the only one to pass T3 (9/9). Its T4 failure is the same as H's.
- exaone-deep:2.4b cannot load under q8_0 KV (head dim 80 is not divisible by the block size 32, so llama-server exits). Its scout results are empty rather than wrong. It would need an f16 KV daemon, which breaks the qwen setup. Skip it.
- T1 `input_overflow` for four models is the known no-pinned-tokenizer byte accounting at 32768, not a quality signal. Their T1 is untested.
- ministral-3:3b T3 passed 0/9 and T5 cited the shadowing local's lines; unreliable on scoping.
- granite4.2:3b returned an object instead of a Map on T6. Its T3/T4 output did not compile.
- nemotron-3-nano:4b ties H's clean-pass count but is worse on T3/T4.

## spark-coder:4b (added later, same harness)

| T1 | T2 | T3 | T4 | T5 | T6 | T7 | Clean passes |
|---|---|---|---|---|---|---|---|
| 5/9, +16 | abstain, 26 junk | 8/9 (misses `reading`) | fail (3/7, compiles) | 5/5 | pass | 5/5 | 3 |

Ties H on clean passes and on T1, and is the only small model besides H to reach 5/9 on T1. Better than H on T3 (8/9 vs 7/9, and its valid inputs work), but T2 is the noisiest of all (26 junk lines). Not a replacement for H.

## gemma4:12b (added 2026-10-11, same harness, before the T1 packing fix)

Q4_K_M, 11.9B, 8 GB on a 6 GB GPU, so it partly runs on CPU. Single run.

| T1 | T2 | T3 | T4 | T5 | T6 | T7 | Clean passes |
|---|---|---|---|---|---|---|---|
| 5/9, +3 junk, 168 s | abstain, 0 junk, 83 s | **9/9**, 30 s | 6/7 (`badlater`), 66 s | 5/5 | pass | 5/5 | 5 |

- Best small model so far: the only one to abstain on T2 with no junk lines, and the best local T4 (6/7; others 3/7 or less).
- T4 miss: it filters children to `pair` nodes, so a `**x` splat is skipped instead of rejected.
- T1 is capped at 5/9 by packing, not the model.
- Slow: ~66 tok/s prefill (9k tokens in 136 s) because of CPU spill. T1 took 168 s vs 35–65 s for H.
- The `strict_compile: false` on T3/T4 is a harness bug (tsc TS5112, needs `--ignoreConfig`), not the model. The behavioral checks ran normally.
- Ollama defaults it to thinking on and temp 1. Use `think: false` and the saved `gemma-context:12b-24k` settings (temp 0.2).

## After the T1 packing fix, plus granite4.2:8b (2026-10-11)

Fix: `withFeatureConsumers` in `local-explore-packing.ts`. When a selected config flag (like `cloudClaudeWorker`) is named in the question, the `if (features.x)` consumer in `src/index.ts` now gets a slot, replacing the last text match. Same harness, now saved as `scripts/experimental/run-small-models-2026-10-10.mts` (tsc `--ignoreConfig` fixed; both gemma outputs compile strict).

| Test | H | gemma4:12b | granite4.2:8b |
|---|---|---|---|
| T1 | 4/9, 14 junk, 52 s | **7/9**, 7 junk, 144 s | **7/9**, 7 junk, 166 s |
| T2 | abstain, 20 junk | abstain, 0 junk | abstain, 0 junk |
| T3 | 7/9 | **9/9** | 0/9 (nothing works) |
| T4 | fail 3/7 | fail 6/7 | fail 3/7 |
| T5 / T6 / T7 | pass | pass | pass |

- T1 7/9 is the new reachable max for these models; H fell to 4/9 with the larger context (more junk), so the fix helps larger models more.
- granite4.2:8b: good at selection (T1, T2, T5, T7), bad at writing code (T3 0/9, T4 3/7).
- Tool loop (`local_explorer_task`, SE-03 question): gemma4:12b answered correctly in 87 s with 2 tool calls, `Confidence: high`. granite4.2:8b also answered correctly (needs `num_ctx` 32768; at 16384 it hit `input_overflow` from byte accounting).
- JSON schema output on a 60-line log count (single run): both parsed the schema; both miscounted (gemma got warnings right, granite neither). Plain `format: "json"` works for both. Do not trust either for counting.

### Where to use what

| Job | Model |
|---|---|
| Default, fast (scout, summaries, boilerplate) | H. 3–4x faster. |
| Hard code tasks, `needs_review` retries, T2-style "is this absent?" | gemma4:12b via `model: "gemma-context:12b-24k"` |
| `local_explorer_task` tool loop | gemma4:12b (new option beside qwen3.5:4b) |
| Scout selection when gemma is too slow or busy | granite4.2:8b with `num_ctx` 32768 |
| Code generation | Not granite. |

Not changed: the default model. gemma4:12b is 3–4x slower on this 6 GB GPU, and the evidence is one run per cell.

## Web research (Haiku, 2026-10-10; unverified vendor claims)

| Model | What it is | Best for | Do you need it? |
|---|---|---|---|
| gemma4:e2b | 2.3B effective (5.1B total), text/image/audio, 128K | on-device multimodal, light extraction | Only if you want multimodal. Matches H here, nothing more. |
| exaone-deep:2.4b | math/code reasoning, 32K, non-commercial license | hobbyist math/code reasoning | No. No tool support, long thinking, fails to load here. |
| ministral-3:3b | 3.8B dense, Apache 2.0, vision + tools, 256K | edge image + tool calling | No. Weak on these tests. |
| granite4.2:3b | IBM 3.66B, Apache 2.0, RAG/tools/thinking | enterprise RAG and tool calling | No. No independent evals; failed T3/T4/T6 here. |
| nemotron-3-nano:4b | NVIDIA Mamba2 hybrid, 256K, commercial OK | edge agents on NVIDIA hardware | No. Not better than H; worse at T3/T4. |

Sources: HF model cards, arXiv 2503.12524 (EXAONE Deep), arXiv 2601.08584 (Ministral 3), IBM Granite 4.1/4.2 posts, NVIDIA/Ollama pages. Most 3–4B head-to-head numbers were not found.

## Bottom line

None of these replace H. gemma4:e2b is the only one worth keeping as a second opinion. Raw outputs are in the session scratchpad; the run log is `benchmark-data/small-models-2026-10-10.log`.
