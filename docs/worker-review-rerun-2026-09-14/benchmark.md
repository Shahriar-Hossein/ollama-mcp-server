# Local worker benchmark rerun

Date: 2026-09-14. Purpose: compare the newly installed local models against
the still-installed baselines using the exact prior bounded fixture. This is a
single completion per model and task, not a general model ranking.

## Method

- Local tags tested: `qwen3.5:2b`, `qwen2.5-coder:7b`, `granite4.2:8b`,
  `phi4-mini:3.8b`, and the retained baselines `qwen2.5-coder:3b`,
  `granite4.2:3b`, and `qwen3.5:4b`.
- Requests used `/api/generate`, `stream:false`, `think:false`,
  `num_ctx:32768`, `num_predict:512`, `temperature:0`, `seed:42`, and
  `keep_alive:"2m"`. The extraction request was cold; code and summary were
  warm for each model.
- The run was strictly serial. Each model was explicitly unloaded before the
  next started, and `/api/ps` was empty after every unload and at completion.
- Extraction is exact typed JSON comparison. Code was evaluated in a bounded
  Node VM against six cases (and an input-mutation check); a markdown fence
  separately fails the requested output format. Summary fidelity is manual;
  words are whitespace-delimited.

Raw records include the exact prompts, responses, Ollama timings, residency
snapshots, and digests: [environment.json](environment.json),
[results.jsonl](results.jsonl), [grades.json](grades.json), and
[final-ps.json](final-ps.json). Phi's later replay has a separate complete
[run record](phi4-mini-run-2026-09-14.json).

## Results

| Model | Exact extraction | Code behavior | Code-only format | Summary words / 90 | Wall seconds: extraction / code / summary |
|---|---:|---:|---:|---:|---:|
| Qwen3.5-2B **new** | Fail | 3/6 | Pass | 88 | 8.13 / 2.48 / 1.88 |
| Qwen2.5-Coder-7B **new** | Fail* | **5/6** | Fail | 86 | 19.22 / 2.82 / 6.96 |
| Granite4.2-8B **new** | Fail* | 2/6 | Pass | 146 | 32.76 / 14.95 / 19.13 |
| Phi-4-Mini-3.8B **new** | Fail | **6/6** | Pass | 103 | 17.17 / 2.16 / 3.64 |
| Qwen2.5-Coder-3B | Fail | 4/6 | Fail | 100 | 7.74 / 1.00 / 2.12 |
| Granite4.2-3B | Pass | 2/6 | Pass | 179 | 6.37 / 2.01 / 3.99 |
| Qwen3.5-4B | Pass | 3/6 | Pass | 73 | 10.62 / 3.44 / 2.96 |

\* Both outputs selected the three correct ERROR records in order, but encoded
`line` as a JSON string rather than the required integer. Exact extraction is
therefore a failure.

The code cases belong to one generated function, rather than six independent
tasks. A behavior score does not waive the output contract: the 7B coder put
its answer in a Markdown fence despite being instructed not to.

## New-model observations

- **Qwen3.5-2B:** Its 88-word summary retained the decision-changing caveats
  and rejected the unsupported quota-saving claim; it was the fastest summary
  in this replay. It nevertheless extracted an INFO record and took a
  `request_id` from quoted message text. Its code invented a sort order based
  on IDs, failing three order cases. It is not an extraction or autonomous
  code upgrade over the retained 4B model.
- **Qwen2.5-Coder-7B:** The strongest local behavioral code result, passing
  five cases. It used the supplied `Map` approach then reversed it, so it
  reverses already-distinct input and fails one case; it also added a Markdown
  fence. Its extraction only missed type fidelity (`"17"` instead of `17`).
  Its summary was within budget but omitted the one-run and unmeasured-usage
  limitations. Treat it as a promising code challenger requiring strict
  validation, not a safe default.
- **Granite4.2-8B:** No improvement over Granite4.2-3B on this fixture: exact
  extraction failed on numeric types, code passed only two cases, and the
  summary ran 146 words and repeated itself. It was by far the slowest model.
  Do not promote it for the measured worker roles.
- **Phi-4-Mini-3.8B:** The only 6/6 behavioral code result and it respected
  the code-only output contract. Its `Map` implementation sorts retained rows
  by their original index, which passes this fixture but needs held-out testing.
  Exact extraction failed because it took `request_id` from quoted message
  text, and its 103-word summary exceeded the 90-word limit. It is a promising
  code candidate, not a replacement for the extraction or concise-summary
  roles.

## Comparison and recommendation

The prior recommendation still holds for the tested roles:

- Keep **Qwen3.5-4B** for concise local summaries: it was the only retained
  concise summary under budget (73 words) and preserved the crucial caveats.
- Keep **Granite4.2-3B** for this exact typed extraction fixture. It remains
  the only local pass in this replay.
- Evaluate **Qwen2.5-Coder-7B** next on held-out, executable code tasks if a
  larger local code worker is wanted. Its 5/6 behavioral score improves on
  Coder-3B's 4/6, but it was slower, partially CPU-offloaded, and did not
  satisfy the response contract. A caller must execute tests and reject
  fences/extra prose.
- Evaluate **Phi-4-Mini-3.8B** alongside the 7B coder on held-out executable
  tasks. It was the only model to pass all six current behavioral checks and
  keep the requested format, but this remains one generated function.
- Do not use **Granite4.2-8B** as a replacement based on these data. Do not
  add Qwen3.5-2B as a general routing tier without a narrower summary-only
  benchmark.

The four new models do not displace the existing task-specific choices on a
single fixture. The small run cannot estimate reliability, long-context recall,
or parent-review effort; use held-out tasks before changing defaults.

## Residency observations

`/api/ps` after the cold extraction call reported a 32K context for every
model. The 2B and retained baseline models were fully GPU-resident. The larger
new artifacts were not: Qwen2.5-Coder-7B reported 5.56 GiB allocated, 3.92
GiB VRAM; Granite4.2-8B reported 7.98 GiB allocated, 3.99 GiB VRAM; and
Phi-4-Mini-3.8B reported 4.77 GiB allocated, 3.97 GiB VRAM.
These are Ollama allocation snapshots, not peak-memory measurements, but make
their latency comparison materially different from the fully GPU-resident
baselines.

| Model | Allocated GiB | VRAM GiB | GPU residency |
|---|---:|---:|---:|
| Qwen3.5-2B | 2.48 | 2.48 | Full |
| Qwen2.5-Coder-7B | 5.56 | 3.92 | Partial |
| Granite4.2-8B | 7.98 | 3.99 | Partial |
| Phi-4-Mini-3.8B | 4.77 | 3.97 | Partial |
| Qwen2.5-Coder-3B | 2.60 | 2.60 | Full |
| Granite4.2-3B | 3.39 | 3.39 | Full |
| Qwen3.5-4B | 3.46 | 3.46 | Full |

## 16K follow-up: larger artifacts

On 2026-09-14, the two larger local artifacts were replayed at
`num_ctx:16384`, with the same prompts, sampling parameters, and `q8_0`
global KV cache. The prompt sizes are only a few hundred tokens, so this is a
memory/residency experiment rather than a long-context quality test. Each
model was unloaded before its cold extraction request.

| Model | 32K → 16K allocated GiB | 32K → 16K VRAM GiB | Cold extraction seconds | Extraction result |
|---|---:|---:|---:|---|
| Qwen2.5-Coder-7B | 5.56 → 5.05 | 3.92 → 3.99 | 19.22 → 22.08 | Fail → Pass |
| Granite4.2-8B | 7.98 → 6.49 | 3.99 → 4.07 | 32.76 → 20.00 | Fail → Fail* |

The allocation values are Ollama `/api/ps` snapshots after extraction, not
peak-memory measurements. Both models were still only partially GPU-resident
at 16K. Halving the context therefore did **not** produce the hoped-for full
GPU residency for Qwen2.5-Coder-7B, and its one cold extraction was slower;
do not treat that difference as a regression without repeated trials.

Granite4.2-8B's cold extraction was 12.76 seconds faster and its allocation
fell by 1.49 GiB, but it still emitted `line` values as strings rather than
integers. This is a useful throughput signal, not a reason to promote it.

The 16K Qwen extraction was exact JSON and passed the fixture, while its code
answer remained fenced and had the same 5/6 behavioral result. Its 81-word
summary still omitted the one-run/usage limitations and introduced the
unsupported claim that B completed both tasks. Granite's 16K code response
would pass the normal ordering cases but uses a plain object and fails the
`__proto__` case; its summary was 145 words, over the 90-word budget. These
single completions are not evidence that context length itself improved model
quality.

\* Granite selected the correct records and order but encoded `line` as a
JSON string. Its code and summary measurements were not a clean warm pair:
Ollama had dropped it from `/api/ps` after the code call. Only the cold
extraction comparison above is directly comparable to the 32K replay.
