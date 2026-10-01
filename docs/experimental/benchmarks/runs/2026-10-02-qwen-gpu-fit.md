# Qwen clean-load GPU context fit — 2026-10-02

The overlap hypothesis does not explain away the 64K failure: a clean
65,536-token load still places one layer on CPU. No other Ollama model was
resident before any probe. Earlier overlap is unverified; the original
17% CPU / 83% GPU observation remains valid for that run.

Qwen 3.5 4B Q4_K_M, Ollama 0.34.3, GTX 1660 SUPER (6 GB), q4_0 KV,
Flash Attention enabled, one inference slot. Existing system service settings
were retained. Baseline desktop device usage was 446 MiB. Each probe unloaded
all Ollama models, waited for an empty `/api/ps`, and loaded fresh. Tests were
sequential under one detached lock. No embedder was used.

| Requested context, tokens | Clean loads | Placement | Observation |
|---|---:|---|---|
| 65,536 (64 Ki) | 1 | 15% CPU / 85% GPU | 33/34 layers on GPU |
| 65,024 | 1 | 15% CPU / 85% GPU | 33/34 layers on GPU |
| 64,512 (63 Ki) | 1 | 16% CPU / 84% GPU | 33/34 layers on GPU |
| 63,488 (62 Ki) | 3 | 100% GPU | Each generated READY |
| 61,440 (60 Ki) | 2 | 100% GPU | 34/34 layers on GPU; larger prompt checked below |
| 57,344 (56 Ki) | 3 | 100% GPU | Each generated READY; 34/34 layers on GPU |

This brackets the observed clean-load boundary between 63,488 and 64,512;
it does not establish an exact threshold. These are allocated windows, not
measurements of filling every token or evidence-selection quality.

## Why an apparently small increase spills

The runner's fit calculation includes a 1,685 MiB free-memory target and a
986.67 MiB worst-case vision-projector estimate, even for these text requests.
At 65,024, the initial projection was 3,503 MiB against 5,159 MiB free;
its target was missed by 29 MiB. At 64,512, it missed by 23 MiB. It then
reduced GPU placement to 33/34 layers. At 61,440 it projected 3,454 MiB
and kept 34/34 layers. These are recorded runner estimates, not a measurement
of actual image inference or proof that removing vision would solve the fit.

Thus reported device free memory alone does not predict placement. The
63,488 result has little margin in the runner's fit calculation. Use a lower
window for ordinary work and check placement after loading. A fixed context
cannot promise GPU placement under arbitrary other GPU workloads.

Raw baseline, request/response metrics, `/api/ps`, `ollama ps`, GPU samples and
journal excerpts are in ignored `benchmark-data/qwen-context/gpu-fit/`.
`probe.py` and `extend.py` preserve the load protocol. GPU-only means model
layer placement (`100% GPU` and equal model `size`/`size_vram`), not zero host
RAM, zero CPU work, or 100% GPU utilization. This follows Ollama's
[placement documentation](https://docs.ollama.com/faq).

## Installed extensions and larger-prompt check

- `qwen-context:f-q4_0-60k`: 61,440 context, 8,192 output ceiling.
- `qwen-context:g-q4_0-56k`: 57,344 context, 8,192 output ceiling; prefer
  this extension for additional fit margin. Both inherit A's sampling,
  template and identical weights. Configurations and Modelfiles are in
  `/home/shahriar/ollama-models/qwen-context/`.

At 61,440, a doubled source bundle reached 36,134 input tokens in the runner
log (`truncated = 0`). The 240-second client deadline expired just as prefill
finished; the server cancelled the task and became idle. This is a timeout,
not a successful answer. All 236 sampled `/api/ps` entries showed identical
model `size` and `size_vram`; peak total device usage was 5,208 MiB.

The same bundle completed at 57,344 with a 600-second deadline: 36,134
uncached input tokens, 2 output tokens (`READY`), natural stop, 252.4 seconds.
All 248 device samples retained equal model `size`/`size_vram`; peak total
device usage was 5,017 MiB. The 56 Ki context was not fully filled. This
checks sustained text processing and placement, not retrieval accuracy,
maximum input capacity or a full-window/long-output stress test. It is a
different cell, not a replacement score for the 60 Ki timeout.

Both installed tags were then checked using their inherited context defaults
and a short prompt, without an API `num_ctx` override. Each returned READY
at 100% GPU. The preferred G tag was left loaded with a ten-minute keep_alive.

Keep one Ollama inference model resident, q4_0 KV, Flash Attention and one
slot. More desktop/GPU activity may still cause a future load to spill.
The runner fit margin is smaller than the eventual device free-memory
reading suggests; 56 Ki offers roughly 56 MiB more projected fit margin
than 60 Ki in this run. Check `ollama ps` and reject CPU placement for work
requiring GPU-only inference. The MCP scout still overrides context to 16384.

## Subsequent user-selected testing baseline

H (`qwen-context:h-q4_0-50k`) is installed with exactly 50000 context
and 25000 output ceiling. A clean inherited-default request returned READY
and stayed 100% GPU at context 50000. Settings and response are saved in
`h-q4_0-50k-installed.json`; H was left loaded. Reserve 1024 margin, leaving
23976 input tokens when reserving all 25000 output tokens. Full-ceiling
generation is untested. Use H for further tests; F/G remain references.

Subsequently, the user removed A/E/F/G model tags and retained only H among
q4 context variants. B was already absent. C/D q8 tags and base
`qwen3.5:4b` remain. Historical Modelfiles and benchmark results are preserved;
`configurations.json` marks A/B/E/F/G removed.

Final configuration cleanup: only H/q4_0/50000 and I/q8_0/32768 context
variants are retained, each with a 25000 output ceiling. A–G tags and
Modelfile folders were deleted. Base `qwen3.5:4b` remains; historical
measurements above are unchanged. KV precision requires the matching daemon.
