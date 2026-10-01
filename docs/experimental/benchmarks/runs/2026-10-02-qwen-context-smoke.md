# Qwen context smoke comparison — 2026-10-02

All five configuration variants completed one sequential four-question smoke
run. A (q4_0 / 32K) is the candidate for the next capacity comparison, not a
selected routing default. B (q4_0 / 64K) partially offloads to CPU. No variant
improved the completeness of returned evidence on these small prompts.

| Run | Total seconds | Input tokens per call | `evidence_selected` | Placement |
|---|---:|---:|---:|---|
| A | 83.8 | 1458–3716 | 2/4 | 100% GPU |
| B | 98.2 | 1458–3716 | 2/4 | 17% CPU / 83% GPU |
| C | 104.3 | 1458–4285 | 2/4 | 100% GPU |
| D | 103.7 | 1458–4285 | 2/4 | 100% GPU |
| E | 87.2 | 1458–3716 | 2/4 | 100% GPU |

A/B/E: q4_0 KV at 32K/64K/16K. C/D: q8_0 KV at 16K/20K.
All use the same Qwen 3.5 4B Q4_K_M weight layer, thinking off, seed 42,
output ceiling 2000 and identical sampling. Retrieval is basic; evidence
packing remains 24,000 characters. Individual API calls use a 120-second
request timeout and the scout allows one retry. No additional timeout reruns.

## Evidence review

The two successful validator statuses are not two complete semantic answers.
For every configuration, exact returned citations provide:

- SE-01: registration and feature assignment, but omit the helper rule needed
  to establish the default when the feature-specific variable is unset.
- SE-02: both environment-variable assignments, but only the local-worker
  registration mapping; the cloud mapping is absent.
- EMBED-01: complete keep_alive assignment and stated memory-contention reason.
- QR-LOCK-01: PID lookup and live-lock rejection, but omit the transaction,
  lock insertion and service callers needed to explain concurrent exclusion.

Under a strict complete-evidence criterion, only EMBED-01 is complete (1/4).
All runs return useful partial evidence on the other questions. These judgments
refer to evidence returned to the parent, not model reasoning or final task success.

## Limits and next step

- One repetition per configuration; no median/p95 or routing conclusion.
- Inputs use roughly 1.5K–4.3K tokens, so they do not exercise window capacity.
- C/D lock retries expanded their prompt; A/B/E did not. Total-time comparisons
  therefore include different trajectories and cold-load costs.
- A and E have similar task outcomes. A's additional allocated capacity has not
  yet demonstrated benefit on larger inputs.
- B runtime logs report 32/34 layers on GPU, versus 34/34 for E/A.
- Runtime q4_0 cache and Flash Attention are confirmed in logs. Placement
  samples are not peak VRAM/RAM measurements. C/D retain their original
  baseline artifacts; their runtime cache logging is less complete.
- Next: add expanded-input evidence checks and run three repetitions with
  cache-block rotation, before selecting a default or testing output sweeps.

Raw outputs, timing/token metrics and runtime snapshots:
`benchmark-data/qwen-context/` (ignored). Source-reviewed conclusions are here.
The daemon remains q4_0 with one inference slot. The temporary override is
`/etc/systemd/system/ollama.service.d/zz-qwen-benchmark.conf`; remove it and
reload/restart the service to restore the previous configuration.
