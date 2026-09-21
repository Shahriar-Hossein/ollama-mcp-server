# Early single-prompt trials — 2026-09-12 / 09-13

Superseded by [MASTER.md](../MASTER.md), which uses a fixed
three-task fixture. Kept because this is where the `think:false` fix came
from and because it's the only evidence for a few tags that later runs
dropped.

One prompt per model per task, single run. Enough to catch a hard bug, not
enough for quality rankings.

## What this established

1. **The `qwen3.5` empty-response bug is not GPU contention.** It reproduced
   on an idle GPU, solo, on both `0.8b` and `4b`, across all three task
   types — `eval_count` topping out around 3,900-4,000 tokens of hidden
   thinking before the length limit, with an empty `response`. `generate()`
   never set `num_predict`, so the model burned the whole default budget on
   the `thinking` field.
2. **`think:false` fixes it completely**, on both sizes, every task. It also
   cut wall time 2-5.5x across the board.
3. **`granite4.2:3b` has no separate thinking channel** — its chain of
   thought lands in `response`, sometimes with the code duplicated once
   inline and once after a literal `</think>`. Still true in the current
   runs; see the granite trap in the master doc.
4. **Don't retire `qwen2.5-coder:3b`.** On the reasoning task it produced a
   *hallucinated* fix — accurate diagnosis in prose, then a "corrected" code
   block byte-identical to the buggy original. But on mechanical coding it
   stayed the fastest and cleanest of the stack.

## Email-validator prompt — before/after `think:false`

"Write `isValidEmail(email: string): boolean` with a regex, then 3 vitest
tests. Output only the code."

| Model | Size | Wall (before → after) | Tokens (before → after) | Result after |
|---|---|---|---|---|
| qwen3.5:0.8b | 1.0 GB | 44.7s → 31.6s | 4031 → 381 | Empty-response bug fixed, output still broken: undefined import, mixes `assert`/`expect`, asserts invalid emails as valid |
| qwen2.5-coder:1.5b | 986 MB | 30.4s → 6.9s | 273 → 244 | Correct; still appends prose after the code block |
| qwen2.5-coder:3b | 1.9 GB | 9.6s → 8.4s | 175 → 262 | **Best.** Clean, correct, obeys instructions |
| granite4.2:3b | 2.2 GB | 22.3s → 7.3s | 871 → 188 | CoT leak gone, output clean and correct |
| qwen3.5:4b | 3.4 GB | 77.5s → 14.1s | 3532 → 372 | **Biggest jump.** Was buggy and leaking; now clean and 5.5x faster |

## Three-task verification — 2026-09-13

Testing a proposed 3-tier stack (`qwen3.5:0.8b` fast, `granite4.2:3b`
coding, `qwen3.5:4b` reasoning). One model at a time, unloaded between
calls, GPU confirmed idle.

### Coding (email validator)

| Model | `think` | Wall | Tokens | Result |
|---|---|---:|---:|---|
| qwen2.5-coder:3b | default | 6.0s | 160 | Correct |
| granite4.2:3b | default | 12.8s | 762 | Correct but CoT-polluted, code duplicated |
| granite4.2:3b | false | 6.5s | 228 | **Buggy** — imports `isValidEmail` *and* redeclares it |
| qwen3.5:4b | default | 78.3s | 4044 | **Empty** |
| qwen3.5:4b | false | 9.8s | 182 | Correct |
| qwen3.5:0.8b | default | 37.3s | 4044 | **Empty** |

### Reasoning (diagnose a timezone / string-comparison bug)

| Model | `think` | Wall | Tokens | Result |
|---|---|---:|---:|---|
| qwen2.5-coder:3b | default | 8.1s | 325 | **Wrong** — correct prose diagnosis, "fixed" code identical to the original |
| granite4.2:3b | default | 20.4s | 1282 | **Correct**, messy, ships working code |
| qwen3.5:4b | default | 76.9s | 3917 | **Empty** |
| qwen3.5:4b | false | 17.3s | 592 | **Correct**, concise |

### Extraction (log → JSON)

| Model | `think` | Wall | Tokens | Result |
|---|---|---:|---:|---|
| qwen2.5-coder:1.5b | default | 5.2s | 287 | Correct, markdown-fenced against instructions |
| granite4.2:3b | default | 25.6s | 1599 | Correct data, CoT-polluted |
| qwen3.5:0.8b | default | 35.9s | 3869 | **Empty** |
| qwen3.5:0.8b | false | 5.5s | 243 | Correct, fast |

## `summarize_output` spot check

Fed this doc's source (7,347 chars) through the tool's own call shape
(qwen2.5-coder:3b): 7,347 → 1,450 chars, ~5x compression, 19.3s.

It kept timings, the `think:false` fix and the routing recommendation. It
dropped the two things that mattered most: that qwen2.5-coder:3b's reasoning
failure was a *silent* hallucination, and the small-sample warning. That's
the summarization risk in one example — use it for noisy logs, not for
anything where a dropped caveat changes a decision.
