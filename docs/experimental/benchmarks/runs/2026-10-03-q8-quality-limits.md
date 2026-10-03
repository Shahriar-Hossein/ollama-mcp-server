# Q8 KV-cache input/output limits — 2026-10-03

Recommended request limits: **32768 context / 1024 output**, thinking off.
This leaves **30720 input tokens** after the existing 1024-token margin.
For bounded scout answers, 512 is the smallest tested scout ceiling and
leaves 31232 input tokens. These are model budgets, not guaranteed MCP capacity.
Saved model settings and system daemon settings were not changed.

Q8 here means KV-cache precision. I and H retain the same Qwen 3.5 4B
Q4_K_M weights; this does not test Q8 weight quantization.

## Context and placement

| Test | Observation |
|---|---|
| 40960 context, one-token probes | GPU-only on three clean loads |
| 43008, 45056 and 49152 context probes | CPU offload |
| 38912 context, real 11950-token source input | CPU offload; same incorrect answer as smaller contexts |
| 32768 context, three positional source layouts | All GPU-only at 30137 measured input tokens |
| 32768 context, behavior and summary fixtures | GPU-only at 28323 and 9726 input tokens |

Use 32 Ki for the quality-oriented profile. Larger allocation successes do
not establish stable workload placement or better answers. Keep H as the
existing high-input option. No full-window 38912 copy sweep was completed;
the initial supervisor was stopped after the 32 Ki layouts, as recorded in
the raw protocol amendment.

## Minimum tested output

| Fixture | Ceiling | Actual output | Stop |
|---|---:|---:|---|
| Five-line evidence, 11950 input | 256 | 256 | Length; incomplete JSON |
| Same evidence | 512 | 326 | Natural; one wrong evidence item remains |
| Code behavior, 7772 input | 256 | 256 | Length; incomplete JSON |
| Same behavior | 512 / 1024 | 470 / 470 | Natural; same incorrect answer |
| Source overview, 9726 input | 512 | 512 | Length |
| Same overview | 1024 / 2048 | 1011 / 1011 | Natural; identical outputs |

1024 is the smallest tested ceiling covering these concise tasks. The summary
used almost all of it; this is not a universal output limit. Longer answers
need an explicit larger reserve. Natural stopping does not prove correctness.

## Quality

- Q8 scout completeness was **1/4** at each ceiling: 512, 1024 and 2048.
  All model calls stopped naturally; returned quotes were checked against source.
- The matched Q4 scout also scored **1/4**. All four request sequences
  matched Q8, including prompts, schemas and options.
- The same 30137-token evidence request scored **3/5 exact lines with Q8**
  and **4/5 with Q4**. Neither returned all required evidence correctly.
- Q4 and Q8 both got four of six field groups wrong on the identical
  7772-token behavior request. Q8's larger 28323-token behavior answer also
  got four groups wrong. Expected feature, budget and command results were
  checked using the repository implementations; lock behavior was source-reviewed.
- The completed Q8 summary still presents expected benchmark phrases as
  implementation facts, including safety claims without supplied implementations.

There is **no demonstrated quality gain from Q8** on these fixtures. Keep
source review and frontier reasoning; larger reserves did not fix selection
or reasoning errors. These are bounded, single-session observations, not a
general reliability estimate. The analysis accepts either numeric budgets
or objects containing `input_budget`, since the behavior prompt did not
explicitly distinguish those representations.

## Practical limits and evidence

Cold 30137-token copy calls took about **203 seconds**, exceeding the server's
120-second default HTTP deadline. The raw probes used a 600-second deadline.
The same input has a **102383-byte conservative bound** and fails the current
MCP preflight even with the recommended reserve. Maximum model input therefore
requires improved input accounting and an appropriate deadline before the MCP
tools can use it directly.

Runs used isolated daemons, verified Q4/Q8 K and V cache types, Flash Attention,
one inference slot, thinking off, temperature 0.2 and seed 42. There were no
timeout retries. Prompt reuse affects timings; no speed ranking is claimed.
Placement was sampled after calls; host RAM and transient GPU peaks were not measured.

Raw requests, responses, source hashes, runner snapshots, protocol amendments
and analysis v2 remain under ignored `benchmark-data/qwen-context/` in
`q8-quality-2026-10-03/` and the two `q8-quality-behavior-*-2026-10-03/` folders.
All completed phase manifests and runner/source hashes were verified.
Temporary daemons and model stores were removed; the benchmark lock is free.

Next: apply task-specific output reserves and improve input accounting and
selection. This run does not justify switching routing to Q8 for higher quality.
