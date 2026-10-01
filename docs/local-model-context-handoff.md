# Qwen context evaluation handoff

Updated: 2026-10-02. Branch: `main`. Baseline: `b49f0a75d69cf1961501de82eaa6dcceb4f4224a`.
Working tree was clean before this handoff; preceding work is committed.

## Goal and decisions

Keep two installed Qwen 3.5 4B Q4_K_M context variants for further testing:

| Tag | KV cache | Context | Output ceiling |
|---|---|---:|---:|
| `qwen-context:h-q4_0-50k` | q4_0 | 50000 | 25000 |
| `qwen-context:i-q8_0-32k` | q8_0 | 32768 | 25000 |

- H remains the system q4 baseline. I requires a verified q8 daemon;
  model names do not select KV precision. Keep Flash Attention and one slot.
- With 1024 margin and the full output reserve, input limits are 23976
  (H) and 6744 (I). Ceilings are maxima; request concise results by default.
- Both contexts passed GPU placement checks; full 25000-token output is
  untested. Future placement depends on other GPU usage.
- All A–G tags and Modelfile folders were deleted at the user's request.
  Base `qwen3.5:4b` remains. Benchmark evidence stays in this repository.
- q4/65536 still spills on clean load; 63488 fits on three loads but 64512
  spills. q8/32768 fits on three clean loads; its maximum is unmeasured.
- The scout still defaults to 16384 context and 8192 output. Explicit
  context/output controls are required in wrappers to test H/I faithfully.
  No accuracy-based routing winner was established.

## Completed and verified

- Five original tags created under `/home/shahriar/ollama-models/qwen-context/`.
  Active tags were subsequently recreated with 8192 output limits.
- Initial four-question smoke completed for A–E with 2000-token controls.
- Phase 2: three four-question smoke repetitions for each active configuration;
  source-reviewed complete evidence was 3/12 per configuration (embedding case).
  Other cases supplied partial evidence but omitted default helper, cloud mapping,
  or locking transaction evidence. Validator success is not semantic correctness.
- Direct-source diagnostics: three positional layouts per cell, with calibrated
  token counts, required lines present and matched source hashes. At 5534 input
  tokens all four configurations scored 5/9 exact lines and 6/9 locations.
- A accepted 18083 input tokens entirely on GPU; uncached processing took about
  100 seconds. More context did not improve exact-evidence completeness.
- Same 36-record inventory, 13520 input tokens: 8K output truncated JSON;
  16K stopped naturally at 13443 tokens, valid JSON, all 36 records, 29 exact.
  Six records lost a quote character; one changed a Unicode character.
- All active phase-2 configurations remained GPU-only. Prompt reuse dominates
  smoke timing; q8's direct uncached matched layouts were slightly faster.
- Seven scout fixture tests passed earlier. New Python harness passed syntax
  checks; diffs passed whitespace checks. Earlier TypeScript check was blocked
  by missing `vitest` in an existing experimental test.

## Artifacts and current runtime

- Q8/32768 verified on three clean loads, all GPU-only, including 5528-token
  source input. See `docs/experimental/benchmarks/runs/2026-10-02-qwen-q8-gpu-fit.md`.
  This is not a maximum/full-window test. Temporary q8 daemon removed;
  system q4 settings and H baseline restored. C/D were subsequently deleted.
- Clean GPU-fit recheck: `docs/experimental/benchmarks/runs/2026-10-02-qwen-gpu-fit.md`.
  Raw results and scripts: ignored `benchmark-data/qwen-context/gpu-fit/`.
- Reviewed results: `docs/experimental/benchmarks/runs/2026-10-02-qwen-context-phase2.md`.
- Earlier controls: `docs/experimental/benchmarks/runs/2026-10-02-qwen-context-smoke.md`.
- Plan/current checkpoint: `docs/local-model-context-checklist.md`.
- Runner: `scripts/experimental/run-qwen-context-comparison.py`.
- Raw requests/results/metrics/manifests: ignored `benchmark-data/qwen-context/phase2/`.
  `q4/` smoke is valid; its ambiguous-wrapper capacity pilot is excluded.
  Corrected diagnostics are in `q4-capacity-v2/`; long comparison in
  `q4-long-36/`; q8 comparisons in `q8/`; aggregate in `summary.json`.
- Temporary q8 daemon and temporary weight references were removed after completion.
  System service remains q4_0, Flash Attention enabled, one inference slot.
  Its temporary override is `zz-qwen-benchmark.conf`; inspect all service
  overrides before restoring settings. Administrator actions require user sudo.

## Next step and traps

Read the reviewed phase-2 report, then inspect question decomposition and
bundles in `src/experimental/tools/local-explore-repo.ts` to explain the missing
default helper, cloud mapping and locking evidence. Improve one packing/selection
behavior, then rerun the same held-out cases before expanding scope.

- The scout explicitly overrides context to 16384 even when passed the A tag.
  MCP context/budget controls remain unfinished; benchmark wrappers override it.
- Direct-source diagnostics bypass scout retrieval/quote copying; their quote
  errors are not evidence that the scout invents copied source snippets.
- Three capacity layouts are not three repeats of an identical prompt.
  Cache blocks were not rotated across independent sessions; no robust winner.
- RAM peaks, wider held-out projects, parent follow-up work and adaptive
  exploration were not measured/implemented. Keep experimental tools opt-in.
