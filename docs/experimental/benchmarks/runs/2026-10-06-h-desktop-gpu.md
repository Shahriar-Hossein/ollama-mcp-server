# H desktop GPU fit and 24K default — 2026-10-06

H now defaults to **24576 context / 16000 saved output**, using
`qwen-context:h-q4_0-24k` (digest `72e74925c51e`). Its weights, renderer,
sampling, q4_0 KV, Flash Attention and single-slot daemon settings are unchanged.
A fresh process invoking the current MCP handler returns READY, and `ollama ps` reports **100% GPU**,
24576 context and 3.3 GB. The original 50K tag retains its saved settings as an
explicit larger-context option.

## Diagnosis

The user's [WordPress feedback](../field-feedback.md#2026-10-06-mixed-mcp-smoke-checks)
used explicit H/50K requests. The corresponding allocator load projected 3300 MiB
against 4771 MiB available and a 1685 MiB free-memory target: a 215 MiB deficit.
Because context was explicitly 50000, it reduced GPU layers instead of context.
This explains the reported 22% CPU / 78% GPU placement. Reducing the output ceiling
alone would leave the allocated context unchanged.

Larger contexts require more memory; allocated context and offload can be checked
with `ollama ps`. See [Ollama's context guide](https://docs.ollama.com/context-length).
The allocator's worst-case vision-projector allowance also applies to these text
requests. Daemon configuration already has the intended q4 KV, Flash Attention and
one slot, so this change does not restart or modify the daemon, force GPU layers,
or close desktop applications.

## Placement screen

Each trial unloads the previous H runner and verifies an empty model list before
loading. The runtime is Ollama 0.34.3 on a GTX 1660 SUPER with 6144 MiB VRAM.
Three contexts are checked at current desktop usage, then with a bounded
idle CUDA allocation to approximate the earlier desktop memory footprint.
This reservation runs no compute kernels and is released afterward.

| Context | Current desktop | Calibrated memory pressure | Initial fit margin under pressure |
|---|---|---|---:|
| 50000 | 16% CPU / 84% GPU | 22% CPU / 78% GPU | -204 MiB |
| 32768 | 100% GPU | 17% CPU / 83% GPU | -21 MiB |
| 24576 | 100% GPU | 100% GPU | +130 MiB |

24K is the largest tested context meeting the initial 128 MiB margin criterion.
Two additional cold loads are GPU-only; their margins are 131 and 116 MiB.
All three pressure loads and both 24K timing runs remain GPU-only. These observations
support the desktop default, not a guarantee under arbitrary competing GPU usage.

The first pressure attempt targeted 4771 MiB of NVIDIA-reported free memory, but
the extra CUDA context left only 4639–4658 MiB visible to the model allocator.
32K spilled; 24K loaded on GPU with only 4 MiB margin. That stricter screen is
preserved and failed the margin requirement; it ran no timing stage.

The calibrated follow-up targets 4903 MiB before loading the model context.
Its allocator samples for the three pressure sizes range from 4726 to 4781 MiB,
near the earlier 4771 MiB observation. They are not identical controlled free-memory
values; do not infer an exact fit threshold from the table.

## Fixed-input timing

A frozen synthetic 28300-character source asks for an archive name, CSS grid column
count and the executable Markdown exclusion command. Each measured request follows
an unloaded runner and READY warm-up. Prompt, schema and sampling are identical;
only context changes. Every clean trial processes **9677 input / 32 output tokens**,
returns the exact expected object and stops naturally.

| Profile | Clean trials | Median request seconds | Input tokens/second | Output tokens/second |
|---|---:|---:|---:|---:|
| 50K, 22% CPU / 78% GPU | 2 | 48.45 | 204.6 | 30.4 |
| 24K, 100% GPU | 2 | 47.85 | 205.6 | 48.0 |

Output decoding is about **58% faster** on this short synthetic response. Total time
improves only about **1%**, because input processing dominates. This is a small
configuration comparison, not a broad speed or plugin-quality benchmark; it does
not isolate context size from placement as independent causes.

The first 50K timing may overlap repository test processes. It is retained but
excluded from the clean summary and replaced after tests finish, under the same
bounded reservation. No test processes run during the replacement or the two 24K
timings. Cold-load costs are outside the timed request after READY.

## MCP capacity and verification

| H/24K output reserve | Input allowance before prompt/schema charges |
|---|---:|
| Saved full ceiling: 16000 | 7552 |
| Delegation/summary default: 8192 | 15360 |
| Scout default: 2048 | 21504 |

Live model settings and tokenizer preflight accept the synthetic source through
both basic handler request shapes with their default 8192 reserve. Their input
bounds are 9670 and 9695. An explicit 16000 output reserve correctly refuses these
same inputs; evidence and requested ceilings are never silently reduced.
Forwarding is inspected with generation stubbed; those are capacity checks, not
model answers. A real short default handler call separately verifies READY,
completion metadata and GPU residency on the installed tag.

The Quality Review lock scout preflight fits at 8826 charged tokens including its
3131-byte schema reserve, using the installed vocabulary and renderer. Its source
selector is stubbed to test packing/forwarding. Two portable source-packing tests
use byte fallback and exceed 24K capacity, so they retain explicit 50K requests.
Small default-route tests verify 24K; budget refusal and explicit limits stay covered.

Pass: **75 tests**, whitespace checks and TypeScript with only the existing missing
Vitest test excluded. Standard TypeScript checking still reports that dependency.
The user's WordPress feedback is preserved, and its PHP/release-routing and answer
errors remain open. GPU fit does not repair those quality failures.

## Use and next checkpoint

Restart the MCP server through your client so a fresh process loads the new default.
In Codex for VS Code, run **Developer: Reload Window** from the command palette.
Existing clients explicitly
requesting `qwen-context:h-q4_0-50k` must select `qwen-context:h-q4_0-24k` or omit
`model`; high explicit context overrides can still offload. Prefer bounded source
inputs and inspect placement after a load. Keep 50K for explicit larger requests
when its capacity is needed and available VRAM allows it.

Next: address unsupported PHP reporting and release-document routing using the
plugin failures as development cases, then freeze new questions for validation.
GPU-only long-output fidelity, actual plugin response quality and parent review
effort remain separate measurements.

Ignored `benchmark-data/h-gpu-default/` preserves requests, protocols, both pressure
screens, journals, placement samples, timings, the isolated replacement and handler
calibration. Supervisors complete sequentially and release both shared locks and
all pressure allocations. The final short handler leaves H/24K resident on GPU.
