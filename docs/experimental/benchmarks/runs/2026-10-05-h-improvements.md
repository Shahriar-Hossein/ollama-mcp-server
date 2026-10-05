# H-only selection, output reserves and input accounting — 2026-10-05

H returns complete source-backed evidence on all four development questions
in three runs at the saved 16000 output ceiling, and again in three runs at
the new 2048 scout reserve. Four synthetic MCP delegation/summary requests
also meet their output contracts. These are development checks, not held-out
accuracy or measured parent-work savings.

Later the same day, the [CPU placement diagnosis](2026-10-05-h-cpu-placement.md)
reduced the operational context to 50000. Measurements below used 64000
before that adjustment.

## Selection

The earlier checklist reported complete evidence on 2/4 questions. Source
was already present; the model omitted guards and locking-chain elements.

| Implementation stage | Complete evidence | Notes |
|---|---:|---|
| Stronger wording and named retry requirements | 3/12 | Still misses guards/helper and chooses invalid refs |
| Source-ref shortlists and bounded schema | 6/12 | Drops partial citations; broad throw heuristic falsely accepts an unrelated error |
| Shortlists, partial retention, specific lock rejection | 12/12 | All required chain elements present |
| Same selection with 2048 default output reserve | 12/12 | All required chain elements present; natural stops |

Each row has three runs of the same four questions. Stages change source and
prompts; they are separate implementation checks. Saved seed 42 makes these
repeated fixed-setting checks, not independent sampling trials. Some answers
include irrelevant source refs in addition to all required evidence.

- Give each evidence requirement a shortlist of matching displayed refs.
  Shortlists remain heuristic; the model must inspect source and the parent
  must interpret relationships.
- Restrict structured output to supplied evidence refs and question-part IDs.
  Remove redundant numeric source-line fields from the model prompt; retain
  source locations in checked results.
- Retain checked partial citations across the existing two-attempt budget.
  Recheck coverage on the combined citations, separately for each part.
- Require a competing-worker rejection rather than any `throw`. The earlier
  check accepted a process-error rethrow without the queue-owner rejection.
- Keep source quotes copied from the indexed evidence. Source review/audit
  checks the actual expected guards, defaults, mappings and locking chain,
  rather than treating `evidence_selected` as a correctness score.

## Output reserves

H's saved settings remain 64000/16000. Context inherits from the selected
model. Default output is the smaller of its finite saved ceiling and:

| Route | Default reserve | H input allowance after 1024 margin |
|---|---:|---:|
| Delegation and summaries | 8192 | 54784 |
| Deterministic-first and legacy scouts | 2048 | 60928 |

Explicit `num_predict` overrides remain available for long output. Metadata
reports whether a limit came from model settings, tool policy or request.
The fixed smoke scout used 114–132 output tokens per call with the new
reserve, all stopping naturally. The legacy scout reserve is fixture-tested;
this benchmark exercises the deterministic-first route.

## Input calibration

Generation tools and the deterministic-first scout now report separate UTF-8
byte charges for prompt, system, schema and template. They retain the
conservative bound and safety margin. No input is dropped to make a request fit.

`calibrate-h-input.ts` invokes registered MCP handlers on sanitized synthetic
inputs, retaining their actual requests, budget metadata and Ollama metrics.
It does not capture private Codex/Claude conversation history.

| Input | Byte bound | Actual input tokens | Bound / actual | Output tokens | Time | Contract |
|---|---:|---:|---:|---:|---:|---|
| Source: list 60 exported functions | 3728 | 1112 | 3.35 | 291 | 11.3 s | Pass |
| Logs: copy two failures | 49912 | 21007 | 2.38 | 31 | 116.0 s | Pass |
| Unicode: copy one error | 19967 | 4897 | 4.08 | 12 | 22.1 s | Pass |
| JSON: list failed IDs | 8923 | 2978 | 3.00 | 13 | 13.2 s | Pass |

All four stop naturally and stay within the reserved input allowance. The
49912-byte log request would exceed the old 46976 allowance; the new 8192
summary reserve accepts it. The benchmark uses an explicit 240-second
request deadline; production remains 120 seconds. This log took nearly that
production deadline. One sample per input type does not establish reliable
latency, maximum capacity or a safe universal bytes-to-tokens conversion.
Keep the conservative check until a matching tokenizer is available.

## Protocol and verification

- H tag/digest: `qwen-context:h-q4_0-64k` / `954528268064`; thinking off,
  saved sampling and unchanged model/daemon settings. No I runs.
- Each smoke artifact freezes Git HEAD, working-tree diff, fixture version,
  source bundles, requests/options and token/timing metrics. Calibration also
  records HEAD/diff and raw synthetic requests.
- One detached, locked supervisor at a time. All artifacts are complete and
  the lock is released. Runs reuse the resident model/prompt cache; there is
  no fresh-load latency or cache-order comparison.
- Placement snapshots after runs show 64000 context and **17% CPU / 83% GPU**.
  Placement was not sampled throughout generation. These are not GPU-only
  measurements and do not reproduce the tiny-prompt clean-load ceiling sweep.
- Pass: 14 scout, 12 model-budget, 3 feature and 8 Quality Review fixtures;
  whitespace checks; TypeScript including both benchmark CLIs while excluding
  only the existing experimental test importing missing `vitest`. Standard
  TypeScript still reports that pre-existing missing dependency.
- Ignored artifacts: `benchmark-data/h-improvements/`. `selection-*` and
  `shortlist-*` are intermediate implementations; `retained-*` is final
  selection at 16000, `reserves-*` is final selection at 2048.
  `source-audit.json` records exact-source and per-part requirement checks;
  `input-calibration.json` contains the four MCP requests and metrics.

Next: held-out cross-file questions and negative cases on another repository,
scoring complete evidence, irrelevant citations and abstentions. Extend input
calibration with sanitized actual caller request shapes. Full-ceiling long
output fidelity remains unverified.
