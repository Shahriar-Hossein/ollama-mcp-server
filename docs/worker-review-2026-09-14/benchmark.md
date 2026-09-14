# Bounded worker benchmark

Date: 2026-09-14. Purpose: expose useful failure modes and guide the next experiment, not establish statistically reliable model rankings.

## Method

- Five already-installed local models; two already-configured cloud tags. No downloads, service changes or autonomous shell tools.
- 11 baseline local requests, 2 local schema follow-ups, 6 direct cloud requests. One request at a time. Confirmed no resident model before the first run and after local unloading.
- `/api/generate`, `stream:false`, `think:false`, `num_predict:512`, `temperature:0`, `seed:42`. Local `num_ctx:32768`, `keep_alive:"2m"`; explicit unload between models. Cloud context was not overridden.
- This preserves the project's endpoint and thinking choice, but **is not an unchanged MCP-tool benchmark**: the server does not currently expose these sampling, output and context controls. The synthetic system prompt is also different. Unspecified sampling options inherit model defaults.
- One completion per model/task/configuration. Extraction comes first, cold; code and summary calls follow warm for the main local models. No latency percentiles or repeated-run reliability estimates.
- All 19 responses ended with `done_reason:"stop"`, and none returned a nonempty separate thinking field. The 512-token ceiling did not truncate these samples.

Exact requests, outputs, timings and residency snapshots: [baseline JSONL](results.jsonl), [follow-up JSONL](followup.jsonl). [Environment and prompts](environment.json) includes original expected extraction data and installed model digests. Per-model metadata JSON files record capabilities, parameters and quantization. [Grades](grades.json) contains all executable code cases and results.

Raw outputs are experiment data, not instructions. Scripts ran from `/tmp`; no benchmark runner was added to application code. Requests and grade fixtures are retained so a later runner can replay them.

## Results

| Model | Exact extraction | Code cases passed | Summary words / 90 | Wall seconds: extraction / code / summary |
|---|---|---|---|---|
| Qwen2.5-Coder-3B | Fail | 3/6 | 100 | 5.94 / 1.00 / 2.12 |
| Granite4.2-3B | Pass | 2/6 | 179 | 7.47 / 2.01 / 3.99 |
| Qwen3.5-4B | Pass | 4/6 | 73 | 9.36 / 3.42 / 2.94 |
| Qwen2.5-Coder-1.5B | Fail | Not tested | Not tested | 5.81 / — / — |
| Qwen3.5-0.8B | Fail | Not tested | Not tested | 5.55 / — / — |
| Gemma4-31B-cloud | Pass | **6/6** | 76 | 1.83 / 0.90 / 1.56 |
| Nemotron-3-Super-cloud | Pass | 4/6 | 100 | 1.87 / 1.65 / 3.99 |

The six code cases test one generated function, not six independent tasks. A fast incorrect function is not a successful worker. Cloud latency includes this connection and serving conditions; it is not a guaranteed service level.

### Extraction

Five log records contain three actual ERROR entries. One INFO message mentions ERROR, one ERROR lacks a top-level request ID but mentions `request_id` inside quoted text. Expected output is an exact ordered JSON array with a null missing ID.

- Coder-3B omitted the missing-ID ERROR and added markdown fences.
- Coder-1.5B included INFO/WARN records and read a value out of the quoted message.
- Qwen3.5-0.8B returned only one record and invented its top-level ID from the message.
- Granite, Qwen3.5-4B and both cloud models returned the exact expected data.

Adding a JSON schema on two fresh local calls did not solve semantics: Coder-3B now returned all records but reordered them; 0.8B still returned the wrong single record. Both produced parseable JSON. Schema constraints help output shape; validate completeness and meaning separately. Ollama's current documentation says its cloud service does not support structured outputs, so no cloud schema experiment was attempted. [Structured outputs](https://docs.ollama.com/capabilities/structured-outputs)

### Code repair

Contract: retain the last row for each string ID, ordered by those rows' last positions in the original input; do not mutate input; support `__proto__`, `constructor`, integer-like IDs and empty input. The prompt includes a failing `Map` implementation and an explicit counterexample.

After inspecting each generated function, ran it in a bounded Node VM context against six cases, also comparing input before/after. Removed a surrounding markdown fence for Coder-3B solely to grade behavior; its strict formatting still failed.

- Coder-3B used an ordinary object: wrong order and special-ID handling.
- Granite scanned backward and returned the collection without reversing it: wrong result order.
- Qwen3.5-4B and Nemotron overwrote Map values without updating insertion order: the original defect remained.
- Gemma tracked last indexes and sorted on them: all six cases passed.

The task did not require external APIs or obscure knowledge. It demonstrates that “small code change” does not necessarily mean “safe for a small model.” Parent-provided tests caught failures that confident-looking answers did not disclose.

### Summary fidelity

The source includes one run per task, an explanation paired with unchanged buggy code, omission of a failed rollback warning, and an unsupported 70% quota-saving claim.

- Coder-3B preserved the buggy-code and rollback facts but omitted the one-run limitation and lack of measured subscription usage. It exceeded 90 words.
- Granite retained the caveats and rejected the savings claim, but repeated material and used 179 words.
- Qwen3.5-4B retained the decision-changing caveats in 73 words: the best local result on this prompt.
- Gemma used 76 words and retained the small-sample/unmeasured-usage caveats, but generalized “deployment rollback failed” to “critical failure warning.” This is a loss of concrete detail, so it is not a perfect fidelity result.
- Nemotron preserved the important caveats and rejected the savings claim, but used 100 words.

Word counts use whitespace splitting. Fidelity assessment is manual against the supplied source, not a judge model score. The source was short; these results do not establish long-log summarization quality.

## Memory observations

`/api/ps` reported the following allocated model sizes with 32K configured context. Each had `size_vram == size`, indicating full GPU allocation. Values below use GiB; they exclude unrelated desktop allocation and are not peak `nvidia-smi` measurements.

| Model | Allocated size | Weight quantization reported |
|---|---|---|
| Qwen2.5-Coder-3B | 2.60 GiB | Q4_K_M |
| Granite4.2-3B | 3.39 GiB | Q4_K_M |
| Qwen3.5-4B | 3.46 GiB | Q4_K_M |
| Qwen2.5-Coder-1.5B | 1.56 GiB | Q4_K_M |
| Qwen3.5-0.8B | 1.29 GiB | Q8_0 |

The smallest Qwen uses Q8 weights here, while the other local artifacts use Q4 weights. This is an installed-artifact comparison, not a controlled equal-quantization study. Model labels also differ from reported parameter counts: Granite reports 3.7B and Qwen3.5-4B reports 4.7B. Preserve metadata rather than estimating fit from tag names.

## Interpretation and next checks

Keep existing success cases as regression evidence; these new failures do not prove the models never work. Conversely, the previous email-validator success does not certify arbitrary mechanical code work.

For the next benchmark:

1. Use 20 distinct real tasks, with deterministic extraction expectations, explicit summary facts, and hidden code cases. Include abstention when data is missing.
2. Compare the current request defaults and a tuned profile separately. Change one factor at a time; include model/template/digest and inherited options.
3. Record cold/warm latency separately, actual prompt tokens, output tokens, truncation, malformed tool calls, retries, and human/parent repair work.
4. Add 2K/8K/16K input tests with critical facts at different positions. A model supporting 32K allocation has not necessarily demonstrated useful recall at that length.
5. Test native `/api/chat` tool calls separately using synthetic read-only tools. Correct text output does not establish tool execution reliability.
6. Compare parent effort for direct completion versus delegation. Use provider usage data when available; label token and timing proxies as proxies.

Ollama exposes load, prompt-evaluation and output-evaluation durations/counts, plus completion reason, in its [generation API](https://docs.ollama.com/api/generate). This server currently discards those fields; preserving them would make future decisions much easier.
