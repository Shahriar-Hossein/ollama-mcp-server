# H CPU offload diagnosis and 50K default — 2026-10-05

Follow-up: [matching-tokenizer accounting and held-out checks](2026-10-05-h-tokenizer-heldout.md)
now recover the rejected log's production input capacity. A post-reboot 50K
load also offloaded two layers at lower available GPU memory; the safer
default is still not a GPU-only guarantee. Original measurements below are
preserved as recorded.

H's original 64000-context load offloaded two layers on the first scout
question, SE-01. The following scout stages and synthetic calibration reused
that mixed runner. H is now configured for **50000 context / 16000 output**,
with the same Qwen weights, template and sampling. The installed canonical
tag is `qwen-context:h-q4_0-50k`.

## Which case spilled, and why

At the original load, before the first scout answer:

- Runner projection: 3489 MiB, including 2513 model, 612 context and
  362 compute MiB. Available device memory: 5109 MiB.
- Reserved free-memory target: 1685 MiB. The projection missed it by
  65 MiB; the explicitly requested context could not be reduced automatically.
- The fit process selected 32 GPU layers. The model loaded **32/34 layers
  on GPU**, and `ollama ps` reported **17% CPU / 83% GPU**.
- A 986.67 MiB worst-case vision-projector estimate is logged even for
  these text requests. Visible model weights alone do not determine fit.

The spill already existed during small scout questions; the later 21007-token
log request was not its first trigger. The retained snapshots after every
stage show mixed placement. Only one generation model is resident in those
snapshots; these deterministic basic-retrieval tests do not load an embedder.
Lowering `num_predict` alone did not change the resident 64000 context or
restore GPU placement. A smaller allocated context needs a fresh runner.

The free-memory reading is an observation. The original capture does not
identify which desktop process caused its difference from later loads.

## Fresh clean-load checks

Each size was checked on three tiny READY prompts and the exact original
scout request, unloading H and verifying an empty model list before every
load. q4_0 KV, Flash Attention and one slot were verified; daemon settings
were unchanged. All 16 fresh loads stayed GPU-only under lighter GPU usage.

| Context | GPU-only clean loads | Projected device use | Fit margin if free memory returns to the original 5109 MiB |
|---|---:|---:|---:|
| 64000 | 4/4 | 3489 MiB | -65 MiB |
| 61440 | 4/4 | 3454 MiB | -30 MiB |
| 57344 | 4/4 | 3398 MiB | +26 MiB |
| 50000 | 4/4 | 3300 MiB | +124 MiB |

The last column is a calculation using the observed projections and original
free-memory reading, not a controlled replay of the original GPU workload.
At the first fresh 64K load, free memory was 5251 MiB, 142 MiB higher than
at the failing load. The exact original scout also stayed GPU-only when
loaded fresh at 64K. Prompt size alone does not explain the original spill.

50K adds useful margin compared with 56 Ki, whose 26 MiB counterfactual
margin is small relative to the observed resource variation. It is the safer
operational default, not a guarantee under arbitrary competing GPU activity.
Keep q4 KV, Flash Attention and one slot; verify placement after a load.
Do not force layer placement or bypass the allocator's safety target.

## Installed-default and sustained verification

- Created H/50K from the existing base weights. `/api/show` and
  `ollama show --parameters` confirm 50000 context / 16000 output.
  New model digest: `beafd8b50f62`.
- Three production scout runs inherit those model settings and the 2048
  tool reserve. All **12/12** cases contain the expected source evidence
  with exact copied quotes. Post-run snapshots show **100% GPU**, context
  50000. These remain development fixtures, not held-out quality scores.
- The exact earlier log request was then replayed on a clean 50K runner.
  It processed 21007 input tokens and 31 output tokens, stopped naturally,
  and copied the same two failure lines. All **115 loaded-model snapshots**
  at one-second intervals stayed GPU-only.
- Sustained time was **118.1 seconds**, versus 116.0 in the earlier mixed
  run. This is no demonstrated speedup; load/cache conditions were not
  controlled for a latency comparison. The benchmark deadline was 240
  seconds, and both results are near production's 120-second deadline.
- The sustained replay deliberately bypasses the conservative bridge byte
  preflight. Its previously measured input count fits 50K. It does not show
  that the production bridge accepts the entire raw log at this context.

## Input capacity and compatibility

At 50K with a 1024 safety margin, input allowances are:

| Output reserve | Input allowance |
|---|---:|
| Saved 16000 ceiling | 32976 |
| Delegation/summary default 8192 | 40784 |
| Scout default 2048 | 46928 |

The earlier 49912-byte log request now exceeds the delegation/summary byte
allowance. It should return `input_overflow`, without omitting source or
silently reducing requested output. Its actual 21007 tokens fit; matching
Qwen tokenizer accounting is the next way to recover capacity safely.
Do not restore a marginal 64K default merely to satisfy this byte estimate.

The old `qwen-context:h-q4_0-64k` name initially remained as a compatibility
alias for the same **50000/16000** configuration. It was removed on
2026-10-05 to avoid a misleading entry in `ollama list`. Clients using that
tag must switch to `qwen-context:h-q4_0-50k`. Restart the MCP server to load
the canonical default and previous code improvements.
Explicit `num_ctx` overrides can still request a larger, potentially spilling
window.

## Evidence and checks

- Ignored evidence: `benchmark-data/h-cpu-placement/`. Original runner log,
  clean-load requests, model settings, GPU snapshots, per-load journals,
  `summary.json`, three `scout-50k-*` artifacts, source audit and
  `sustained-50k.json` are retained.
- Sequential detached supervisors share one lock. Prior artifacts completed
  before the next stage; no concurrent model comparisons.
- Pass: 12 model-budget and 14 scout fixtures; whitespace; TypeScript with
  only the pre-existing test importing missing `vitest` excluded. Feature
  and Quality Review tests passed for the preceding implementation commit;
  their behavior is unchanged by the model-default adjustment.

Matching-tokenizer accounting and the first held-out checks are now recorded
in the follow-up above. The log replay here exercises long input and short
output; consult the follow-up for sustained-output results and remaining work.
