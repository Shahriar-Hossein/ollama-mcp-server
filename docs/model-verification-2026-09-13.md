# Verifying the ChatGPT-recommended model stack

ChatGPT proposed retiring `qwen2.5-coder:1.5b`/`3b` in favor of a 3-tier stack:
`qwen3.5:0.8b` (fast/extraction), `granite4.2:3b` (coding worker), `qwen3.5:4b`
(reasoning). This doc tests that claim directly against this project's exact
`generate()` call shape (`/api/generate`, `stream: false`, no `think` param
unless noted).

## Methodology

- One model at a time. Each call ran to completion, then the model was
  explicitly unloaded (`keep_alive: 0`) and the GPU was given a 2s pause
  before the next call — no two models ever shared the GPU.
- GPU was idle (12% util, ~430MB used) before testing started, confirmed via
  `nvidia-smi`. This directly tests the suspicion that the original
  [model-benchmarks.md](model-benchmarks.md) numbers for `qwen3.5` were an
  artifact of GPU contention. They weren't (see below).
- Three task types, one prompt each, run against the contested models:
  1. **Coding** — same prompt as the original benchmark doc (email validator
     + vitest tests), for continuity.
  2. **Reasoning** — a debugging task requiring understanding *why* a bug
     only manifests under a specific condition (ISO date strings compared
     across timezones), not just pattern-matching a fix.
  3. **Extraction** — parse a small log into JSON. Meant to represent the
     "fast/cheap worker" tier.

## Results

### Coding task

| Model | think param | Wall time | Tokens | Response | Notes |
|---|---|---|---|---|---|
| `qwen2.5-coder:3b` | default | 6.0s | 160 | Correct | Clean, matches original benchmark |
| `granite4.2:3b` | default | 12.8s | 762 | Correct but polluted | Entire chain-of-thought leaked into `response`, code duplicated (once inline in the reasoning trace, once after a literal `</think>` tag) |
| `granite4.2:3b` | `false` | 6.5s | 228 | **Buggy** | Clean output, but imports `isValidEmail` from `./emailValidator` *and* redeclares it in the same file — a duplicate-declaration bug |
| `qwen3.5:4b` | default | 78.3s | 4044 | **Empty** | All 4044 tokens spent on hidden thinking, hit a length ceiling before emitting any `response` |
| `qwen3.5:4b` | `false` | 9.8s | 182 | Correct | Clean, correct, comparable quality to qwen2.5-coder:3b |
| `qwen3.5:0.8b` | default | 37.3s | 4044 | **Empty** | Same failure mode as the 4b version, same token ceiling |

### Reasoning task (diagnose a timezone/string-comparison bug)

| Model | think param | Wall time | Tokens | Response | Quality |
|---|---|---|---|---|---|
| `qwen2.5-coder:3b` | default | 8.1s | 325 | Present | **Wrong.** Correctly describes the bug in prose, then outputs a "corrected" code block that is byte-for-byte identical to the original buggy function — no fix actually applied |
| `granite4.2:3b` | default | 20.4s | 1282 | Present (CoT-polluted) | **Correct.** Messy (visible reasoning, some wrong side-tangents about ASCII comparison), but converges on the right root cause and ships working corrected code |
| `qwen3.5:4b` | default | 76.9s | 3917 | **Empty** | Same length-ceiling failure as the coding task |
| `qwen3.5:4b` | `false` | 17.3s | 592 | Present | **Correct.** Concise, accurate root cause, working fix |

### Extraction task (log → JSON)

| Model | think param | Wall time | Tokens | Response | Quality |
|---|---|---|---|---|---|
| `qwen2.5-coder:1.5b` | default | 5.2s | 287 | Correct | Valid JSON, wrapped in a markdown fence despite "no explanation" |
| `granite4.2:3b` | default | 25.6s | 1599 | Present (CoT-polluted) | Correct data, but the entire per-line parsing reasoning leaks into `response` |
| `qwen3.5:0.8b` | default | 35.9s | 3869 | **Empty** | Same failure mode again |
| `qwen3.5:0.8b` | `false` | 5.5s | 243 | Correct | Clean valid JSON, fast |

## Key findings

1. **The `qwen3.5` empty-response bug is not GPU contention.** It reproduced
   solo, on an idle GPU, on both `0.8b` and `4b`, across all three task types
   — every single time, with `eval_count` topping out around 3900-4000
   tokens of pure hidden thinking before the generation length limit hit.
   `generate()` in [`src/ollama-client.ts`](../src/ollama-client.ts) never
   sets `num_predict`, so the model burns the entire default budget on the
   hidden `thinking` field and never reaches the answer.

2. **`think: false` fixes it completely**, for both `qwen3.5` sizes, on
   every task tested — turns a broken/unusably-slow call into the fastest,
   cleanest result in its class (5.5s–17.3s, correct output, zero thinking
   leakage). This is a one-line fix to the request body in `generate()`.

3. **`granite4.2:3b` has no separate thinking channel** — confirms the
   original benchmark doc's finding. With default settings its entire
   chain-of-thought lands in `response` (once inline, once repeated after a
   literal `</think>` marker in the coding test). `think: false` does turn
   this off for Granite too, but on the one test where it was clean it also
   introduced a real bug (duplicate `isValidEmail` declaration) — sample
   size here is too small to call this reliable.

4. **ChatGPT's "Granite for coding, Qwen3.5-4B for reasoning" split holds up
   better than "retire qwen2.5-coder entirely" does.** On the reasoning
   task, `qwen2.5-coder:3b` produced a *hallucinated* fix — correct
   diagnosis in prose, but the shipped code was unchanged from the buggy
   original. Both `granite4.2:3b` and `qwen3.5:4b` (with `think: false`)
   produced genuinely correct fixes. On the coding task, results were
   closer: `qwen2.5-coder:3b` stayed fastest and cleanest of all of them.

5. **`qwen3.5:0.8b` is viable as a fast/extraction worker, but only with
   `think: false`.** Unmodified, it's currently the least reliable model in
   the entire stack for this tool — 100% empty-response rate across all
   three tests.

## Recommendation

Don't retire `qwen2.5-coder:3b` — it's still the fastest, most reliable
choice for mechanical/well-specified coding tasks, and the reasoning-task
failure shows the other models aren't a strict upgrade for that use case.

Do fix the `think: false` bug — this is the highest-leverage change, since
it's what makes `qwen3.5:0.8b` and `qwen3.5:4b` usable via `run_ollama_task`
at all. Concretely, in [`src/ollama-client.ts`](../src/ollama-client.ts):

```ts
{ model, prompt, system, stream: false, think: false }
```

Once that's in place, a reasonable routing rule based on this data:

- **Well-defined, mechanical coding task** → `qwen2.5-coder:3b` (fastest,
  most reliable, no CoT-pollution risk).
- **Task needs actual judgment about *why*, not just *what*** (debugging,
  architectural review) → `qwen3.5:4b` with `think: false`.
- **Bulk extraction/classification/formatting** → `qwen3.5:0.8b` with
  `think: false`, or `qwen2.5-coder:1.5b` — both were fast and correct.
- **`granite4.2:3b`** needs more testing before trusting it as a primary
  worker — it produced a real bug on the one test where its output was
  clean, and even with `think: false` its coding-task result had a
  duplicate-declaration error `qwen2.5-coder:3b` didn't make.

This is a 3-test, single-run sample per model — enough to catch the
empty-response bug and validate the `think: false` fix, not enough to trust
fine-grained quality rankings. Treat "Granite has a bug" and "qwen2.5-coder
hallucinated a fix" as single data points, not verdicts.


Ran the test — fed docs/model-verification-2026-09-13.md (7391 chars) through the same call summarize_output makes (curl to Ollama, qwen2.5-coder:3b, the tool's system prompt), then compared the summary against the source.

Result: 7347 → 1450 chars (~5x compression), 19.3s wall time. It kept the concrete facts (timings, the think: false fix, the routing recommendation). But it dropped two things that mattered: the fact that qwen2.5-coder:3b's reasoning-task failure was a silent hallucination (looked right in prose, shipped unchanged buggy code — the single most important caveat in the doc), and the "small sample size, don't over-trust this" warning. Those are exactly the kind of nuance that gets sanded off by summarization, and here it's about which model to trust for what.

Verdict on integrating with the commit skill: don't. Two independent reasons:

No cost is being spent there to save. The whole design of commit/SKILL.md is that I never touch the diff myself — I write a brief from memory and a cold subagent reads the actual git diff. My context never sees it either way. Routing that subagent's diff-reading through Ollama first wouldn't remove any tokens from my side; it would just add a ~20s latency hop in front of an agent that's supposed to finish in 3-5 tool calls.
Commit grouping/messages are exactly the correctness-critical category your own CLAUDE.md says not to delegate. My test just demonstrated the failure mode directly: a lossy summary can quietly drop the one detail that should've changed a decision. For diffs, that's grouping and wording — mistakes there are annoying to unwind (amended/re-pushed history).
So: gain is real for what I built it for (compressing noisy logs/dumps before they enter my context), but there's no version of "wire it into commit" that helps your actual goal — it doesn't touch my token usage and adds risk to output quality where precision matters. I'd leave the commit skill untouched.

If you still want a concrete win from this tool, the better target is something like piping a large npm test/build log through summarize_output before it reaches me — that's where the tokens I'd otherwise pay for actually get avoided. Want me to try that test instead, or are you satisfied leaving commit alone?