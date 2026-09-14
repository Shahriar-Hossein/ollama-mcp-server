# Ollama worker recommendations — 2026-09-14

## Recommendation

Keep the small direct Ollama wrapper. Prioritize **validated extraction, concise summaries, and isolated drafts** over autonomous git workflows. The best opportunity to extend the main assistant's usage is to keep large source material out of its context and return a small, checked result.

There is no demonstrated universal model upgrade here. For now:

- Keep `qwen2.5-coder:3b` for familiar mechanical code templates with executable checks.
- Prefer `qwen3.5:4b`, thinking disabled, for summaries where caveats matter and for more demanding extraction. It is still fallible on small code fixes.
- Keep `granite4.2:3b` as an extraction challenger, not a default autonomous coding worker.
- Try `gemma4:31b-cloud` first when a bounded code task needs cloud quality. This is a provisional choice from a very small sample.
- Do not default to `qwen3.5:0.8b` or `qwen2.5-coder:1.5b` for arbitrary logs. Both failed the extraction trap tested here.
- The first new local model I would benchmark is **`qwen3:4b-instruct`**, followed by **`nemotron-3-nano:4b`**. Neither was installed or tested in this session.

Read [the benchmark](benchmark.md) for measured evidence and [the improvement backlog](improvements.md) for proposed changes. No application code, configuration, existing documents, model installations, git index, or commits were changed.

## What this review established

Reviewed the server, tool implementations, command validators, README and previous experiment documents. Ran 19 synthetic generation requests: 13 local and 6 cloud. Every request was sequential; each local model was unloaded before switching. The final `ollama ps` was empty. Generation requests occupied approximately 72 seconds in total, excluding metadata calls and unloads; this is not total session duration or a quota measurement.

The new code task required keeping the last occurrence of each ID **in last-occurrence order**. All three main local models failed it. Gemma passed all six executable cases; Nemotron retained the original ordering defect. Granite and Qwen3.5-4B passed exact extraction; Qwen3.5-4B gave the strongest concise local summary. These results justify task-specific validation, not a broad leaderboard.

The older [Claude harness experiment](../local-claude-worker-experiment-2026-09-14.md) actually obtained local responses, but at minutes per task, with unreliable actions. Thus “local models cannot run through Claude” is too broad. The demonstrated conclusion is that this hardware/model/harness combination was a poor interactive worker. Keep the lightweight wrapper. Ollama recommends at least 64K context for large-context agent/coding workflows; this is guidance, not proof that every smaller-context call is impossible. [Ollama context documentation](https://docs.ollama.com/context-length)

## Hardware and runtime

Verified Ollama **0.33.3**, GTX 1660 SUPER **6,144 MiB VRAM**, approximately **15 GiB usable system RAM**. At inspection, about 460 MiB VRAM was already used, 7.5 GiB system RAM was available, and swap use was zero. CPU model is user supplied: Ryzen 5 3600X.

Verified service environment:

```text
OLLAMA_CONTEXT_LENGTH=32768
OLLAMA_FLASH_ATTENTION=1
OLLAMA_KV_CACHE_TYPE=q8_0
```

All five installed local models reported 32,768 context and fully GPU-resident model allocation during the short tests. That does **not** test a full 32K input, peak GPU memory, cache quality, or the actual attention kernel selected.

Suggested operating policy, not a configuration change:

- One resident local model and one local generation at a time. Explicit `OLLAMA_MAX_LOADED_MODELS=1` and `OLLAMA_NUM_PARALLEL=1` would make that preference durable. Coordinate across multiple MCP clients too.
- Keep a useful model warm for a batch. Cold loads consumed roughly 4–7 seconds here, enough to erase the advantage of a tiny model on a tiny task.
- Retain Q8 KV as the initial choice. Ollama documents `q8_0` as roughly half the KV memory of F16, with some precision loss; it is separate from model-weight quantization. Check runtime behavior for each architecture.
- Use 4K–8K request context as a candidate setting for small jobs, and 16K–32K when input needs it. Compare memory, correctness and latency before changing the global 32K setting. No speed gain from reducing context was measured here.
- Keep output budgets small, but reject length-truncated answers. Model weights, KV cache, runtime buffers and the desktop all need memory; download size alone does not establish fit.

Ollama documents concurrency controls, keep-alive behavior and cache settings in its [FAQ](https://docs.ollama.com/faq). The operating choices above are recommendations for this machine.

## New local candidates, in priority order

Sizes are current Ollama artifacts, not promised VRAM requirements. Pin the exact tag and record the digest, quantization and template when testing; avoid `latest`.

| Candidate | Why test it / worker role | Fit and caveat |
|---|---|---|
| **`qwen3:4b-instruct`** | General text worker: instruction following, extraction, short patches, tool-call experiments. A useful comparison against Qwen3.5-4B with thinking disabled. | Ollama lists a 2.5 GB Q4_K_M artifact. Qwen's Instruct-2507 model card describes a non-thinking-only model. Verify the downloaded tag/template corresponds to the intended revision. No local superiority established. [Ollama tag](https://ollama.com/library/qwen3:4b-instruct), [Qwen model card](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) |
| **`nemotron-3-nano:4b`** | Tool selection, structured extraction, short text tasks; compare with the larger cloud Nemotron without assuming the same behavior. | Listed at 2.8 GB. Use the explicit `4b` tag: unqualified Nano currently selects the much larger 30B model. The library's family description includes 30B architecture details; do not transfer them to 4B. [Ollama](https://ollama.com/library/nemotron-3-nano), [NVIDIA 4B card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16) |
| **`qwen3.5:2b`** | Middle option if 0.8B is inaccurate and 4B is too slow for repeated classification/extraction. | Listed at 2.7 GB versus 3.4 GB for 4B: modest artifact savings, not necessarily a large latency win. Benchmark before adding another routing tier. [2B](https://ollama.com/library/qwen3.5:2b), [4B](https://ollama.com/library/qwen3.5:4b) |
| **`qwen2.5-coder:7b`** | Optional code-quality experiment if 3B repeatedly fails useful tasks. | 4.7 GB Q4_K_M artifact leaves tight room on 6 GB VRAM. Start at 4K context and inspect offload/memory. Lower priority than the 4B candidates; it may fit only with compromises. [Ollama](https://ollama.com/library/qwen2.5-coder:7b) |

Do not start with Qwen3.5-9B: the current default artifact is 6.6 GB before runtime memory. Likewise, Gemma4's “E2B” is an effective parameter label, not a 2B-sized download: default E2B/E4B artifacts are 7.2/9.6 GB. The 26B MoE still needs its total weights despite activating fewer parameters. These are poor default GPU-resident workers for this machine. Other quantizations may run, but that requires a separate quality/offload experiment. [Qwen3.5 sizes](https://ollama.com/library/qwen3.5), [Gemma4 sizes and architecture](https://ollama.com/library/gemma4)

Two specialized options for later:

- **`embeddinggemma:300m`**: semantic retrieval of a few relevant code/doc chunks, avoiding whole-file prompts. Listed at 622 MB and 2K context. It produces embeddings, not summaries or code; requires an indexing/retrieval path. Start with `rg` for this small repository. If added for larger projects, embed/index separately and unload before generation. [Ollama EmbeddingGemma](https://ollama.com/library/embeddinggemma)
- **`functiongemma:270m`**: a potential task-specific function router after collecting examples and fine-tuning. Its 301 MB artifact is attractive, but its documentation explicitly positions it as a specialization foundation, not a general dialogue assistant. A rules-based router is simpler at today's scale. [Ollama FunctionGemma](https://ollama.com/library/functiongemma)

## Cloud choices and free-tier uncertainty

Both installed tags, `gemma4:31b-cloud` and `nemotron-3-super:cloud`, successfully answered three direct requests each. This verifies access at test time; it does not verify remaining allowance or how this particular account was charged. The six responses reported 1,208 input and 600 output tokens. No account usage dashboard was inspected.

The current pricing page describes Free as starter credits with access to starter models, one concurrent request, and monthly reset from signup. It does not establish this account's remaining credits or an exhaustive starter-model allowlist. Avoid hardcoding “all cloud models are free,” fixed daily token budgets, or old session/weekly rules. Check the signed-in usage page before a larger cloud experiment. [Ollama pricing](https://ollama.com/pricing)

**Choose Gemma first for the next bounded code benchmark**, based on the measured result here. Keep Nemotron as a comparison option; its cloud scale did not prevent a simple ordering mistake. Prefer direct API calls for a self-contained task. The full Claude harness adds tools and workflow overhead that this task did not need.

If neither current cloud option passes a larger real-task set, screen a current Flash model such as `deepseek-v4-flash` or `glm-5.3-flash` for account eligibility first. Their cloud listings are not evidence of free-tier access or a tested quality improvement. Do not cycle through the whole catalog or buy credits merely to discover access. [Current cloud catalog](https://ollama.com/search?c=cloud)

Cloud models can be accessed through the local signed-in Ollama service; localhost does not mean local inference. Pointing this project's client straight at `https://ollama.com` is a different integration because direct cloud API access requires authentication headers. [Ollama cloud documentation](https://docs.ollama.com/cloud)

## How delegation can extend usage

Measure the parent assistant's **brief + tool interaction + result review + repair** against completing the task directly. Worker tokens are additional compute; a free worker does not make its parent's coordination free. Elapsed worker seconds cannot be translated into subscription quota saved. No such savings were measured here.

Good candidates have large independent input, a compact answer, a clear acceptance check, and little dependence on the parent's current reasoning. Examples:

| Work | First route | Acceptance check |
|---|---|---|
| Parse known machine-readable output | Ordinary parser | Exact fields/counts; no model needed |
| Extract facts from messy text | Qwen3.5-4B / Granite | Schema plus source values, omissions and order |
| Summarize a long noisy test log | Qwen3.5-4B | Failing tests, exit code, exact critical lines, caveats retained |
| Repeated simple code template | Qwen2.5-Coder-3B | Caller-provided executable tests |
| Small bug fix with edge cases | Gemma cloud if available | Hidden cases and actual diff review |
| Architecture, security, ambiguous requirements | Main assistant | Direct review with full context |

Do not delegate a trivial known command just to avoid a parent turn: a deterministic tool can run it. Do not force every hard task through a predictable local failure before using cloud. Use at most one targeted repair attempt, then escalate or return failure.

**Next experiment:** collect 20 representative tasks across extraction, summaries, code transformations and native tool selection. Benchmark Qwen3-4B-Instruct against the current task-specific baselines, one model at a time. Keep new prompts separate from those used to tune instructions. Promote only on reviewed correctness and net parent effort, not token speed alone.
