# Qwen q8 KV at 32K — 2026-10-02

32,768 context tokens stayed 100% GPU on three independent clean loads.
No downward sweep was needed. This establishes a tested q8 window, not its
maximum or a guarantee under other GPU workloads.

Qwen 3.5 4B Q4_K_M weights, Ollama 0.34.3, GTX 1660 SUPER, q8_0 KV,
Flash Attention, one inference slot. A temporary localhost daemon used
references to existing weights. The system daemon's q4 model was unloaded
before testing; no other Ollama model was resident on either daemon.
Each repetition unloaded the preceding runner and checked the system
model list remained empty. No system service settings changed.

| Repetition | Context | Placement | Post-load device usage, MiB | Generation |
|---|---:|---|---:|---|
| 1 | 32768 | 100% GPU | 4864 | Short READY answer |
| 2 | 32768 | 100% GPU | 4813 | Short READY answer |
| 3 | 32768 | 100% GPU | 4831 | Source bundle, 5528 input / 133 output tokens |

Runner logs confirm 34/34 GPU layers, Flash Attention enabled, and K/V
q8_0 buffers totaling 544 MiB. Model `size` and `size_vram` were equal
before and after generation. Device readings are post-load snapshots,
not continuous peaks. Third generation took 27.7 seconds, stopped naturally
and remained GPU-only. It returned READY plus evidence despite the request
for READY only; instruction compliance/evidence correctness did not pass a
semantic review and are not claimed by this placement test.

This is an allocated-context and small-prompt check, not full-window stress
or long-output validation. The generation ceiling was 8192. Reserving 25000
output tokens in a 32768 window, plus 1024 margin, leaves only 6744 input
tokens. KV precision is a daemon setting: passing a q8-named model to the
current q4 system service does not switch it to q8.

Artifacts: ignored `benchmark-data/qwen-context/q8-gpu-fit/`, including
`probe.py`, daemon log, baseline, each request's metrics/placement, summary,
and restored system state. The temporary daemon was stopped and its model
store removed. H/50000 q4 was restored on the system daemon at 100% GPU.
C/D model defaults were not changed; use explicit `num_ctx: 32768` with a
verified q8 daemon for this tested configuration.

Final configuration cleanup: only H/q4_0/50000 and I/q8_0/32768 context
variants are retained, each with a 25000 output ceiling. A–G tags and
Modelfile folders were deleted. Base `qwen3.5:4b` remains; historical
measurements above are unchanged. KV precision requires the matching daemon.
