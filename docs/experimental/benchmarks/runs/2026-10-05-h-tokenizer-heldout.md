# H tokenizer accounting and held-out evidence — 2026-10-05

H generation now counts input with its installed GGUF vocabulary and Qwen35
byte BPE, including system/user/assistant framing for `think:false`.
The previously refused 49912-byte log reaches the production summary handler
at 21007 tokens and returns both required failure lines.

## Implementation and calibration

The supported configuration is pinned to H's existing weight digest and named
`qwen3.5` renderer with the saved `{{ .Prompt }}` template. Vocabulary loading
reads at most 16 MiB of metadata; no generation weights or GPU runner are
loaded by the tokenizer. Input size, pre-token length, merge work and cache
size are bounded. Unsupported models/settings, thinking, unavailable files
and tokenizer failures retain byte accounting. Legacy chat retains bytes.
Schema bytes remain an extra reserve; the 1024-token margin and explicit
output ceilings are unchanged. No source is silently dropped.

All four registered-handler requests stop naturally and pass their exact
output contracts. These are synthetic calibration cases, not held-out
summarization accuracy or measured parent-effort savings.

| Case | Predicted input | Ollama input | Output tokens | End-to-end seconds |
|---|---:|---:|---:|---:|
| Source function inventory | 1112 | 1112 | 291 | 18.5 |
| Failure log | 21007 | 21007 | 31 | 118.1 |
| Unicode failure | 4897 | 4897 | 12 | 21.9 |
| Failed JSON IDs | 2978 | 2978 | 13 | 13.0 |

The final tokenizer also matches all six saved held-out scout calls. Formats
are conservatively reserved separately from these prompt counts. Calibration
uses an explicit 240-second deadline. The log remains close to production's
120-second default; this change demonstrates acceptance, not a speedup.

Four additional one-output-token probes match exactly: Unicode whitespace
and combining marks (31 input tokens), mixed scripts/numerals (45), English
contractions (39), and literal special delimiters (36). These test token
accounting, not answer fidelity; their output may intentionally truncate.

Basic delegation and summary tools now accept `timeout_ms` from 1000 through
900000. Their completion metadata preserves stop reason, token counts and raw
timings. Length stops and unfinished generation return partial text with
`isError: true`. The shared `generate()` text API remains compatible.

## First held-out run

Seven reviewed files from a separate local NestJS repository were copied to a
temporary Git snapshot. Generated files and secret constants were omitted;
the original repository was untouched. Two cross-file questions and two
negative questions were frozen with source hashes and required lines before
the first model call. These questions were not used for tuning beforehand.

| Case | Complete required evidence / safe negative status | Finding | Seconds |
|---|---|---|---:|
| Login caller, signing and expiry configuration | Fail | Signing citation omitted; expiry configuration absent from supplied candidates | 15.2 |
| Bearer extraction, verification, payload assignment and strategy | Fail | Supplied verification call omitted | 9.8 |
| Absent refresh endpoint and rotation call | Fail | Nearby registration code cited despite unresolved endpoint/call | 14.8 |
| Absent guard decorator on a user route | Fail | Nearby controller code cited despite unresolved decorator/binding | 11.4 |

Complete positives: **0/2**. Safe negative statuses before the fix: **0/2**.
All 23 returned quotes are literal source substrings at their reported lines;
some are declaration fragments rather than whole lines. Quote integrity does
not establish relevance. All ten negative-case citations concern nearby code
without establishing the requested absent implementation. The seven extra
positive citations provide context but do not replace missing required lines.

The wrapper previously ignored the model's explicit `unresolved` list when
generic coverage heuristics passed. It now returns `needs_review` for those
results, retaining nearby citations and explaining unresolved requirements.
A fixture checks this independently of the held-out question wording.
Any rerun of these examples is a development check, not another held-out score.
The two negative development reruns both return `needs_review` with explicit
unresolved requirements. Their times are 18.3 and 17.7 seconds on the resumed
mixed runner; no latency comparison is claimed.

## Sustained output and outage

The historical 36-record inventory was tested at 50000 context / 16000
output with a 600-second deadline. The first attempt was interrupted by load
shedding before a final response artifact; it has no fidelity score. The
resumed attempt uses a separate artifact and fresh runner.

- Input: 13520 tokens, matching the tokenizer. Schema reserve adds six bytes.
- Output: 13446 tokens; natural `stop`, valid JSON, all 36 IDs in order and
  all source locations correct. Exact records: **35/36**. One em dash became
  the literal string `\u2014` after JSON decoding.
- End-to-end: **500.0 seconds**, including 8.8 seconds loading, 73.3 seconds
  prompt evaluation and 417.8 seconds generation. The explicit deadline makes
  this request possible; it is far beyond production's ordinary 120 seconds.
- All 491 loaded-model samples during the resumed long-output stage report
  mixed placement. This measures a sustained request with the 16000 ceiling,
  not generation of all 16000 output tokens or exact-copy reliability.

Completed pre-outage calibration and scout snapshots stayed GPU-only. The
post-reboot retry loaded 32/34 layers on GPU: `ollama ps` reported 18% CPU / 82%
GPU. The daemon still reports q4_0 KV, Flash Attention and one slot. Its fit
log projects 3300 MiB against only 4868 MiB free, below the earlier 5109 MiB
observation. The responsible competing process was not identified. This
confirms that 50K's extra fit margin does not guarantee GPU-only placement.
No daemon configuration or forced layer placement was used to change fit.
Retry latency cannot be compared with the earlier GPU-only stage.

## Evidence and next work

- Ignored artifacts: `benchmark-data/h-next/`. Frozen fixtures, original and
  resumed source snapshots, requests, raw results, graders, placement samples
  and supervisor logs are retained separately. The original interrupted
  `long-output.json` is preserved. One invalid tail line in the pre-outage
  placement log is retained and excluded from sample counts.
- One detached supervisor holds `/tmp/ollama-h-improvements.lock`; generation
  stages run sequentially. The original lock was free after reboot before
  resuming. The deleted temporary source snapshot was restored only after all
  seven source hashes matched.
  The resumed supervisor completed all three stages and released its lock.
  H was unloaded afterward; the loaded-model list is empty for a fresh next load.
- Pass: 17 model-budget/tokenizer, 14 scout, 3 feature and 8 Quality Review
  fixtures. TypeScript passes with only the pre-existing missing-`vitest`
  experimental test excluded; new benchmark CLIs are included. Whitespace
  checks pass.
- Next: improve generic cross-file configuration/caller packing and selection
  of missing chain elements. Freeze new unseen questions before evaluating
  those changes. These four questions are now development examples.
- Still unmeasured: representative sanitized caller/session shapes, parent
  review effort, full-window input reliability and sustained GPU-only 16K
  output fidelity under the post-reboot GPU workload.
