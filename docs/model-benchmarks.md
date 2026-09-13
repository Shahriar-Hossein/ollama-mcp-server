# Local model benchmark

Tested 2026-09-12, then re-tested 2026-09-13 after two changes:

- `generate()` in `src/ollama-client.ts` now sends `think: false` (disables
  hidden reasoning for models that support it).
- The Ollama service now actually applies `OLLAMA_CONTEXT_LENGTH=32768`,
  `OLLAMA_FLASH_ATTENTION=1`, and `OLLAMA_KV_CACHE_TYPE=q8_0` (the systemd
  override was previously inert due to a missing `[Service]` header and a
  typo — see git history).

Same request shape both times (`/api/generate`, `stream: false`), same
prompt, one model at a time sequentially to avoid overloading the GPU.

Prompt used: "Write a TypeScript function `isValidEmail(email: string): boolean`
that validates an email address with a regex. Then write 3 unit tests for it
using vitest. Output only the code, no explanation."

## Results: before vs after

| Model | Size | Wall time (before → after) | Tokens (before → after) | Result now |
|---|---|---|---|---|
| `qwen3.5:0.8b` | 1.0GB | 44.7s → **31.6s** | 4031 → 381 | **Fixed the empty-response bug** (`think: false` stops it burning budget on hidden reasoning), but output is still broken: references an `isValidEmail` import that's never defined, mixes `assert` and `expect`, and asserts invalid emails as valid. Still not safe to delegate to. |
| `qwen2.5-coder:1.5b` | 986MB | 30.4s → **6.9s** | 273 → 244 | Correctness bugs from before are gone (no more missing imports/duplicate test/wrong assertion). Still ignores the "no explanation" instruction and appends prose after the code block. |
| `qwen2.5-coder:3b` | 1.9GB | 9.6s → **8.4s** | 175 → 262 | **Still the best.** Clean, correct, obeys instructions. Minor nit flipped: now imports `expect` but not `test` (was the reverse before). |
| `granite4.2:3b` | 2.2GB | 22.3s → **7.3s** | 871 → 188 | Chain-of-thought leak is gone — `think: false` suppresses it even without a separate thinking channel. Output is clean and correct. |
| `qwen3.5:4b` | 3.4GB | 77.5s → **14.1s** | 3532 → 372 | **Biggest jump.** Previously had a logic bug and leaked reasoning; now clean, correct, and 5.5x faster. Genuinely competitive with `qwen2.5-coder:3b` now. |

## What the gain is

- **Wall time**: every model got faster, most by 2-5x. `qwen3.5:4b` improved
  the most (77.5s → 14.1s), almost entirely from `think: false` cutting out
  wasted reasoning tokens — the larger context/KV cache settings mainly help
  keep it fast as prompts grow, not this run's small prompt.
- **Correctness**: `qwen3.5:4b` and `granite4.2:3b` went from "usable with
  caveats" to fully correct output. `qwen3.5:0.8b` stopped failing outright
  (empty response) but is still logically broken — do not delegate to it.
- **Winner unchanged**: `qwen2.5-coder:3b` is still fastest and correct, so it
  stays the default in `src/tools/run-ollama-task.ts`. `qwen3.5:4b` is now a
  reasonable second choice if a task needs a larger model, which it wasn't
  before.

**Known bug — resolved:** the `qwen3.5` family no longer returns an empty
`response` for `qwen3.5:0.8b`; `think: false` fixed that specific failure
mode. It's still not recommended for delegation because its output logic is
unreliable, not because of the empty-response bug.

## Cost / quota comparison

Ollama's cost is $0 regardless of model — it's local GPU, not Claude quota.
What matters is the counterfactual: doing the same task inline with Claude
(Sonnet 5, $2/$10 per MTok) instead of delegating.

- Inline (Claude): ~200 input + ~250 output tokens ≈ $0.003, plus a slice of
  the 5h/week quota.
- Delegated (`qwen2.5-coder:3b`): $0, 0 quota, 9.6s wall time, comparable or
  better output for this kind of mechanical task.

The dollar amount is trivial either way — the real saving is quota *minutes*.
Every mechanical/boilerplate task routed to `qwen2.5-coder:3b` gives back
roughly that much Claude time. The `qwen3.5` models aren't currently safe to
delegate to via this tool — they can silently waste GPU time or leak reasoning
noise into the caller's context.
