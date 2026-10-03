# Fresh GPU-only context boundary — 2026-10-03

The highest repeatedly GPU-only size in this session is **66048 tokens**
(64.5 Ki), passing four independent clean loads. Standard 65536 passed four
loads too. 66304 is unstable, passing twice and spilling twice; 66560 spilled
on all four loads. These are observed allocation results, not a permanent
hardware limit or full-window workload validation.

## Measurements

| Context tokens | GPU-only loads | CPU-offloaded loads |
|---|---:|---:|
| 57344 | 1 | 0 |
| 65536 | 4 | 0 |
| 66048 | 4 | 0 |
| 66304 | 2 | 2 |
| 66560 | 0 | 4 |
| 67584 | 0 | 1 |
| 69632 | 0 | 1 |
| 73728 | 0 | 1 |

Every request returned READY. GPU-only requires a single loaded model,
equal model size/VRAM size, and reported context equal to the request.
The CPU-offloaded requests still execute; 73728 is the largest context
tested here, not a CPU-assisted upper limit.

## Protocol and limits

- Existing H tag, same Qwen 3.5 4B Q4_K_M weights/template; saved tag unchanged.
- q4_0 KV, Flash Attention and one slot verified from effective service
  settings. GTX 1660 SUPER, 6 GB VRAM; Ollama 0.34.3.
- Unload all resident Ollama models and verify an empty `/api/ps` before
  every probe, then wait two seconds. No simultaneous model runs.
- Explicit context override, `num_predict=16384`, thinking off, temperature
  zero and seed 42; short system/prompt requesting only READY.
- Bisection to 256-token resolution, three additional loads at each initial
  boundary, then three additional loads each at 65536 and 66560.
- Baseline sampled device use before loads was 393–412 MiB. Desktop/resource
  conditions were not controlled beyond unloading Ollama models.
- Twenty short clean-load trials, using two sequential detached locked
  supervisors. First completion and lock release verified before validation;
  daemon unloaded on completion. No sustained near-full-context generation.
- Raw requests, responses, model settings, SHA, service environment,
  `/api/ps`, `ollama ps`, GPU snapshots and journal output live under ignored
  `benchmark-data/qwen-context/context-ceiling-2026-10-03/`.

## Interpretation

The earlier clean-load sweep passed 63488 and spilled at 64512; the earlier
[64 Ki/16 Ki workload](2026-10-03-h-64k-16k-output.md) retained 15% CPU /
85% GPU throughout. Those results remain valid. Fresh 65536 loads now stay
GPU-only, and even 66304 changes outcome across repeats. Placement depends
on current resource conditions; there is no demonstrated stable exact ceiling
across sessions. The old fit estimate missed its free-memory target by only
tens of MiB, consistent with a boundary sensitive to available memory.

For an experimental ceiling today, 66048 is the highest repeated success.
For a standard 64 Ki setting, 65536 passes today's placement check but should
be checked after each load. 66048/16384 leaves 48640 input allowance after the
1024 margin; 65536/16384 leaves 48128. Neither was filled in this sweep.

Keep 50K as the operational setting until a fresh 64 Ki/16384 workload run
confirms placement, deadlines and fidelity under representative larger input.
No saved model settings or production defaults changed.
