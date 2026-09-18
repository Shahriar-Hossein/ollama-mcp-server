# Fine-tuned Explorer — plan and validation

**Goal:** a fine-tuned local model that does repo exploration better than the
cloud models do, by learning the *investigation policy* (what to inspect
next, when to stop, when to say "no evidence") rather than repository facts.

**Status:** validated in principle, not started. Steps 0-2 below are
prerequisites and cost nothing but time; do not start training before they
are done.

---

## Why the thesis holds

The strongest evidence is already in this repo. Same four cloud models, same
fixture, same SE-01..SE-05 questions:

| Harness | Result |
|---|---|
| Super Explorer pipeline (one-shot JSON discovery contract) | 0/5, all four models |
| `local_explorer_task` (tool-calling loop, `max_tool_calls: 24`) | 5/5, three of four |

See [super-explorer/benchmarks.md](super-explorer/benchmarks.md) — the
gate-condition re-test and the Round 2 table. A 0/5→5/5 swing with the model
held constant means the harness was the bottleneck, not capability. That is
the case for training a policy instead of knowledge.

Two supporting points:

- The index layer already exists (`src/super-explorer/`: structural tools,
  semantic search, hybrid retrieval, knowledge store, WordPress/WooCommerce
  adapter). Repo facts belong there, not in weights — they go stale on the
  next refactor.
- Confidence/stopping/negative examples target a signal that is currently
  broken: on 2026-09-18 `granite4.1:3b` fabricated a nonexistent codebase at
  **Confidence: high**, and `qwen3.5:4b` fabricated citations at
  **Confidence: high** on SE-02.

## What the data contradicts in the original plan

- **`qwen3.5:2b` is the wrong base model, and has zero data on this task.**
  It fails the extract fixture on both runs, needs `num_predict` 4,096 to
  emit one contract-valid extract (4b needs 2,048), and never produced valid
  code or summary output by 4,096 — it burns its completion budget on hidden
  thinking, the worst trait for a loop needing short structured emissions per
  turn ([benchmarks/32k-context-series.md](benchmarks/32k-context-series.md)).
  CLAUDE.md records `qwen3.5:4b` as the only local model confirmed to emit
  real `tool_calls` in this loop; 2b has never been shown to emit one at all.
  Pick the base from the Step 3 sweep, on tool-call fidelity, not size.
- **The baseline is unstable.** `qwen3.5:4b` went from "most reliable local
  model" (2026-09-16) to 1/5 on serial re-run (2026-09-18), cause unexplained.
  A fine-tune's delta is unreadable against that.
- **The eval set is 5 questions.** SE-01..SE-12 exist, only SE-01..SE-05 are
  scored. One flaky question is 20% — no training effect is detectable at n=5.
- **Hardware is tighter than assumed.** GTX 1660 Super, 6,144 MiB, Turing
  SM 7.5: no bf16, no FlashAttention-2. Inference alone already peaks near
  4,700 MiB for 4b-class models. QLoRA at seq 512 is fine; "2B / 5k / 1024 /
  3 epochs → 10-24h" is optimistic. Training and serving won't share the card.
- **Stale comparison numbers.** The `tool_calls` crash bug was fixed
  2026-09-18, after Rounds 1-2, and cost `gpt-oss:20b-cloud` a question in
  each. Those scores are floors.

---

## Step 0 — Make results measurable

- [x] Resolve the `qwen3.5:4b` drift: 2026-09-16 numbers vs 1/5 on the
      2026-09-18 serial re-run. **Resolved 2026-09-18** (recreated pinned
      fixture, fresh rerun): genuine model-side variance, not fixture drift
      or a prompt change — see
      [super-explorer/benchmarks.md](super-explorer/benchmarks.md#qwen354b-drift-resolution-2026-09-18-recreated-fixture).
      1/5 again on a fresh worktree with an unchanged prompt and unchanged
      model digest. Treat 2026-09-16's 5/5 as an outlier; no baseline is
      trustworthy off a single run — this is exactly what the expanded
      gold set + repeated-run item below is for.
- [x] Expand the gold set from 12 scored questions to 50-100, with answers
      and required evidence. **Partial progress 2026-09-18:** SE-06..SE-12
      are now scored (0/7 on `qwen3.5:4b` via the Super Explorer pipeline —
      see
      [super-explorer/benchmarks.md](super-explorer/benchmarks.md#se-06se-12-via-super-explorer-pipeline-qwen354b-2026-09-18)),
      bringing the set to SE-01..SE-12 (12 total). **Done 2026-09-18:** added
      SE-13..SE-50 covering every remaining `src/super-explorer/*` module
      (discovery, hybrid retrieval, indexing/knowledge store, structural
      tools, outline/read-symbol, semantic search, synthesis/verification,
      framework adapters, explore orchestration, git history), bringing the
      set to 50 questions in `src/super-explorer/gold-set-cli.ts`. SE-13..50
      are not yet scored against any model — only SE-01..12 have run
      results so far. Still need the same run through `local_explorer_task`'s
      tool-calling loop for comparison (not done yet), and could still grow
      toward the 100 end of the range later.
- [x] Split the gold set by repository/feature, not randomly — otherwise
      "Where is X called?" trains and "Who calls X?" tests, which is cheating.
      **Done 2026-09-18:** every question in `gold-set-cli.ts` now carries a
      `group` tag (15 groups, one per feature area — e.g. `shell-safety`,
      `hybrid-retrieval`, `synthesis-verification`). `gold-set:super-explorer
      <root> [model] group:<name>[,<name>...]` runs whole groups at once, so
      a train/test split can hold out entire feature areas instead of
      individual questions that leak an answer to a sibling question.
- [ ] Re-run `gpt-oss:20b-cloud` post-crash-fix so the cloud bar to beat is a
      real number, not a floor.

## Step 1 — Wire the structural tools into the explorer loop (no training)

`local_explorer_task` scored 5/5 with only **Glob/Grep/Read**. The server
already exposes `find_symbol`, `find_callers`, `find_callees`,
`find_references`, `outline_file`, `read_symbol`, `semantic_search`,
`hybrid_retrieve` — the 5/5 sweep used the weakest available toolset.

- [ ] Expose the structural tools to `local_explorer_task`'s tool loop.
- [ ] Re-measure all models on the expanded gold set.
- [ ] Record the delta in [super-explorer/benchmarks.md](super-explorer/benchmarks.md).
      Some of what the fine-tune would teach may be a wiring change.

## Step 2 — Deterministic first-tool classifier (no training)

"Who writes `_foo`?" → metadata writers. "Who calls `Foo::bar`?" → callers.
This is a classifier, not a learned mapping.

- [ ] Write the deterministic query classifier.
- [ ] Measure its coverage on the gold set: how many questions get the right
      first tool without a model in the loop.
- [ ] Record the residual gap. That gap, not the whole problem, is what
      training has to close.

## Step 3 — Experiment 0 baseline

- [ ] Run `qwen3.5:0.8b`, `qwen3.5:2b`, `qwen3.5:4b`, `granite4.2:3b`,
      `nemotron-3-nano:4b`, `ministral-3:3b` through the explorer loop on the
      expanded gold set.
- [ ] Run serially, one model on GPU at a time — never in parallel. The 20s
      pause is only needed when *switching* models (Ollama serves one model
      at a time; give it time to unload/swap); repeated questions against the
      same already-loaded model need no pause between them. Round 3
      confounded local results by firing 5 questions at one loaded instance
      concurrently, not by omitting a pause.
- [ ] Score **tool-call emission fidelity first** (does it emit real
      `tool_calls` at all, every turn?), then correctness, tool-call count,
      hallucinations, failure-to-stop.
- [ ] Pick the base model from this table. Do not assume 2b.

## Step 4 — QLoRA SFT

Only after Steps 0-3. Dataset design from the original plan stands: teach the
loop, not the repo.

- [ ] Build v1 dataset, ~1,000-2,000 samples: synthetic generated traces,
      real repo traces, cleaned Claude/Codex traces, 10-20%
      failure/insufficient-evidence examples.
- [ ] Generate synthetic traces from the existing AST/symbol index — ground
      truth is already there, no manual answers needed.
- [ ] Include explicit stopping behavior and "no evidence, escalate"
      responses. These are the highest-value samples.
- [ ] Smoke run first: 500 samples, seq 512, 1 epoch. Measure VRAM,
      samples/sec, loss. Do not aim for a final model.
- [ ] Full run: QLoRA 4-bit, batch 1, grad accum 8, seq 512→1024, LoRA rank
      8-16, 2-3 epochs, lr ~1e-4, 8-bit AdamW.
- [ ] Evaluate on the held-out repository split, not a random split.

## Step 5 — Distillation flywheel

- [ ] Log every production explorer query and its outcome.
- [ ] When the local explorer fails and Claude succeeds, extract the minimal
      correct trajectory into the dataset.
- [ ] Retrain on a cycle. This is the part that compounds.

---

## Open questions

- Does Step 1 alone close enough of the gap to make Step 4 unnecessary?
- Is `qwen3.5`'s hidden-thinking budget problem fixable by fine-tuning, or is
  it architectural? If architectural, the whole `qwen3.5` family is out.
- Turing without FA2: is QLoRA at seq 1024 on a 2B actually feasible on
  6,144 MiB, or is seq 512 the hard ceiling?
