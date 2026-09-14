# Thinking-enabled worker benchmark

Date: 2026-09-14. Purpose: test whether enabling thinking improves the
existing bounded worker roles now that local requests use a 32K context. This
is one deterministic completion per model and task, not a reliability
estimate.

## Protocol

The extraction, executable-code, and at-most-90-word summary fixtures are
identical to [the prior rerun](../worker-review-rerun-2026-09-14/benchmark.md).
The system prompt, `num_ctx:32768`, `num_predict:512`, temperature 0, seed 42,
and serial cold/warm/unload schedule are also unchanged. The only intentional
change is `think:true` instead of `think:false`.

All nine installed tags were submitted with the flag. Phi-4-Mini and both
Qwen2.5-Coder tags rejected it with HTTP 400, as expected from their reported
lack of thinking capability. Those are supported `think:false` models, not
failed generations.

## Results compared with `think:false`

`E` is exact typed extraction; `C` is executable code cases passed, followed
by whether it met the code-only contract; `S` is summary words, where `<=90`
meets the length contract. A dash means no final answer was emitted.

| Model | `think:false` E / C / S | `think:true` E / C / S | `think:true` wall seconds: E / C / S | Outcome |
|---|---|---|---:|---|
| Phi-4-Mini-3.8B | Fail / 6/6 yes / 103 | unsupported / unsupported / unsupported | — | HTTP 400: does not support thinking |
| Qwen2.5-Coder-7B | Fail* / 5/6 no / 86 | unsupported / unsupported / unsupported | — | HTTP 400: does not support thinking |
| Granite4.2-8B | Fail* / 2/6 yes / 146 | Fail / 0/6 / 383 | 58.00 / 55.80 / 48.06 | Visible reasoning consumed all 512 tokens |
| Qwen3.5-2B | Fail / 3/6 yes / 88 | Fail / 0/6 / — | 13.99 / 6.86 / 7.04 | Separate thinking field consumed all 512 tokens; no final answer |
| Gemma4-31B-cloud | Pass / 6/6 yes / 76 | Fail / 0/6 / — | 2.55 / 2.72 / 4.92 | Separate thinking field consumed all 512 tokens; no final answer |
| Nemotron-3-Super-cloud | Pass / 4/6 yes / 100 | Fail / 6/6 yes / — | 7.83 / 13.00 / 5.58 | Only thinking-enabled code pass; extraction and summary lacked a valid final contract |
| Granite4.2-3B | Pass / 2/6 yes / 179 | Fail / 0/6 / 364 | 11.57 / 7.43 / 7.55 | Visible reasoning consumed all 512 tokens |
| Qwen2.5-Coder-3B | Fail / 4/6 no / 100 | unsupported / unsupported / unsupported | — | HTTP 400: does not support thinking |
| Qwen3.5-4B | Pass / 3/6 yes / 73 | Fail / 0/6 / — | 17.24 / 10.19 / 10.42 | Separate thinking field consumed all 512 tokens; no final answer |

\* The false-mode extraction selected the correct records/order but used a
string rather than numeric `line`.

## Findings

At this unchanged 512-token generation budget, turning thinking on does not
improve any retained worker role. It makes every previously successful exact
extraction and concise-summary result fail. Nemotron's code answer is a useful
single positive data point, but it does not offset its missing final answers
on the other two tasks or establish a default.

The 32K context setting does not solve this behavior. Context is input/KV
capacity; `num_predict` is the completion budget. Thinking and the final
answer share the tested 512-token completion limit. Qwen and Gemma exhausted
that limit in their separate `thinking` fields, so their final `response` was
empty. Granite emitted its reasoning directly in `response`, leaving no
contract-compliant final output.

## Decision

Keep `think:false` as the default for the current bounded worker tools and
the three existing roles. Do not enable thinking globally or revise the model
retention decision from this experiment.

A different experiment could test a **thinking profile** with a materially
larger `num_predict` (for example 4K), a task that actually requires
multi-step reasoning, and separate caps for thinking/final output if Ollama
supports them for the relevant tag. It must be treated as a new latency and
reliability tradeoff, not evidence that 32K alone makes `think:true` safe.
