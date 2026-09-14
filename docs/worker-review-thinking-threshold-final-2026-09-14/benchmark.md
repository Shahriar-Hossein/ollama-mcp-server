# Local thinking-budget threshold

Date: 2026-09-14. Purpose: find the smallest `num_predict` that lets each
eligible local model finish each existing worker fixture with `think:true`.
Only local models were tested. The three Qwen2.5-Coder tags and Phi-4-Mini
were not included because Ollama rejects `think:true` for them.

## Protocol

Each model ran alone, with `num_ctx:32768`, `think:true`, temperature 0 and
seed 42. For each task, `num_predict` was increased from 512 to 1,024, 2,048,
and 4,096, stopping after the first valid result. A valid result means exact
typed extraction, 6/6 executable code with the code-only format, or a
nonempty summary of at most 90 words. Every completed model was unloaded
before the next began.

The 4,096 ceiling is deliberately a practical limit. Qwen3.5 4B already took
about 95 seconds for a single 4,096-token code/summary attempt. The user
stopped Granite4.2 8B before its summary sweep completed; no further model
larger than 4B will be considered for thinking.

## Completed serial results

| Model | Extraction: first passing budget | Code: first passing budget | Summary: first passing budget | Practical result |
|---|---:|---:|---:|---|
| Qwen3.5-2B | 4,096 (36.37s) | None by 4,096 | None by 4,096 | Thinking is useful only for this narrow extraction fixture, and needs the full ceiling. |
| Qwen3.5-4B | 2,048 (35.13s) | None by 4,096 | None by 4,096 | Best supported thinking result: exact extraction at 2K. It does not make code or summary reliable. |
| Granite4.2-3B | None by 4,096 | None by 4,096 | None by 4,096 | It eventually stopped generating, but emitted visible reasoning rather than the required final output. |

At 4,096, Qwen3.5-4B's code and summary attempts still exhausted the entire
budget in its separate thinking field with an empty final response. Qwen3.5-2B
did the same for both tasks. This is a model/task behavior, not a context-size
limit: all requests used the 32K context already.

## Stopped Granite 8B sweep

Granite4.2-8B had completed failed extraction attempts at 512, 1,024, 2,048,
and 4,096 tokens (61.48s, 105.23s, 166.12s, and 167.01s), and failed code
attempts at those same budgets (52.81s, 106.17s, 225.80s, and 300.75s), before
the user stopped the run during the summary sweep. These partial rows are not
an adequate completed comparison and must not guide routing.

## Decision

- Never enable thinking globally.
- Do not run models larger than Qwen3.5 4B with thinking on this hardware.
- If an explicit request needs exact structured extraction and latency around
  35 seconds is acceptable, a narrowly scoped `qwen3.5:4b`, `think:true`,
  `num_predict:2048` profile is the only measured candidate.
- Keep `think:false` for code, summary, normal extraction, and all default
  worker routing.

This remains one deterministic completion per setting. It identifies output
budget thresholds for these fixtures; it does not prove general reliability.
