# Super Explorer — what it is and why a tiny model matters

Plain-language companion to [README.md](README.md) (the design spec) and
[benchmarks.md](benchmarks.md) (the measured numbers).

## What it is

Super Explorer is a repository exploration system where the small model is the
*reasoner*, not the *navigator*.

A normal "let the model explore" setup hands a model `grep` and `read` and
hopes it finds its way. That burns tokens, burns turns, and a 3-4b model
usually gets lost or invents files. Super Explorer flips it: the **harness**
does the navigation deterministically (index, lexical + semantic + structural
retrieval, git history), and the model only does the parts that need thinking —
form a hypothesis, ask for specific evidence, and write the answer. A separate
verifier then checks every claim against real file bytes before it reaches you.

The bet, stated in the spec:

```text
small model + indexes + hybrid retrieval + verification + knowledge store
    >  a cold general-purpose explorer with grep
```

## How it works in a real case

Question: *"Which env vars gate the autonomous tools?"*

```text
   YOU / CLAUDE
        |
        v
  [ question ]
        |
        v
  +-------------------------------------------------+
  |  1. INDEX            (deterministic, no model)   |
  |     tree-sitter -> files, symbols, imports,      |
  |     call edges, tests, git history               |
  +-------------------------------------------------+
        |
        v
  +-------------------------------------------------+
  |  2. HYBRID RETRIEVAL (deterministic, no model)   |
  |     lexical  == exact identifiers / strings      |
  |     semantic == embeddings over symbols+docs     |
  |     structural == callers, callees, proximity    |
  |     -> merged by rank fusion                     |
  +-------------------------------------------------+
        |
        v   candidate evidence (cheap, already found)
  +-------------------------------------------------+
  |  3. DISCOVERY       <== THE SMALL MODEL RUNS     |
  |     "here are candidates. what do you think is   |
  |      true, and what exact evidence proves it?"   |
  |     out: hypotheses + evidence requests          |
  |          (symbol id / file:start:end / commit)   |
  +-------------------------------------------------+
        |
        v
  +-------------------------------------------------+
  |  4. MATERIALIZE     (deterministic, no model)    |
  |     resolve each request to real bytes on disk   |
  |     un-resolvable request -> dropped, not faked  |
  +-------------------------------------------------+
        |
        v
  +-------------------------------------------------+
  |  5. VERIFY          <== SMALL MODEL, narrow job  |
  |     each claim -> SUPPORTED / CONTRADICTED /     |
  |                   INSUFFICIENT                   |
  +-------------------------------------------------+
        |
        v
  +-------------------------------------------------+
  |  6. SYNTHESIZE + SAVE                            |
  |     only SUPPORTED claims -> cited answer        |
  |     reusable findings -> knowledge store         |
  +-------------------------------------------------+
        |
        v
  cited answer:  "CLOUD_CLAUDE_ENABLED === '1' gates
                  run_cloud_claude_task  (src/index.ts:NN)"
```

The important property: a claim with no resolvable evidence is **dropped**, not
answered. Steps 1, 2, 4 and 6 cost no model tokens at all.

## How cloud and local models plug into this

Any model — `qwen3.5:4b` on your GPU or `gemma4:31b-cloud` — slots into boxes 3
and 5. It never touches boxes 1, 2, 4. So:

```text
            SHARED HARNESS (same for everyone)
   index -- retrieval -- materialize -- synthesize
        \                              /
         \      pluggable model       /
          +--- qwen3.5:4b  (local, free, fast) ---+
          +--- granite4.x:3b (local)              +
          +--- gpt-oss:120b-cloud                 +
          +--- gemma4:31b-cloud                   +
```

A big cloud model gets the same pre-chewed evidence a small one does, so it
spends its capability on judgement instead of on navigation. A small local
model becomes *usable at all*, because the navigation it would have failed at
was already done for it.

Two-tier routing this enables: cheap local model answers the bounded lookups,
and only escalates to a cloud model (or to Claude) when verification comes back
`INSUFFICIENT`. That escalation signal is a fact about evidence, not a vibe.

## How things are now (2026-09-18)

Built and wired as MCP tools: the universal index, semantic/structural/hybrid
retrieval, symbol tools (`find_symbol`, `find_callers`, `find_callees`,
`outline_file`, `read_symbol`), git history, knowledge store, `discover_evidence`,
`verify_claims`, `synthesize_verified_answer`, and the `explore_repository`
pipeline that chains them. A WordPress/WooCommerce adapter exists. There is a
12-question gold set (SE-01..SE-12) with a CLI runner.

The honest state of the results:

```text
  Haiku Explore subagent (no pipeline, real tool calls)   5/5   <== control
  local_explorer_task loop + cloud models, 24-call budget 5/5   <== best so far
  local_explorer_task loop + local 3-4b models            0-2/5
  SUPER EXPLORER PIPELINE + any cloud model               0/5   <== blocked
  SUPER EXPLORER PIPELINE + qwen3.5:4b                    2/5
```

The blocker is **not** retrieval quality and **not** model reasoning. It is the
one-shot structured-JSON discovery contract in box 3: three of four cloud
models fail the schema on most questions and never reach evidence resolution.
The same models, asked the same questions through the simpler tool-calling loop
in `local_explorer_task`, sweep 5/5. So the plumbing works and the entry door is
too narrow. Fix the discovery contract (repair-retry exists; a tool-call-shaped
discovery step is the obvious next step) before concluding anything about model
capability.

Also currently true: local 3-4b models produced confidently-wrong answers in the
latest rounds, including one `Confidence: high` fabrication — the confidence
signal, normally the one reliable correctness proxy here, failed. Don't treat
`qwen3.5:4b`'s 2026-09-16 pilot numbers as still valid.

## Why a 2b model can be genuinely valuable here

A 2b model cannot explore a repository. It can still do every job this pipeline
actually asks of it, because each job is small, local, and verified downstream:

- **Ranking, not finding.** Retrieval hands it ~20 candidates. Picking the 3
  that matter is a judgement a 2b model makes fine; finding them from scratch is
  what it can't do.
- **Naming the evidence.** "To prove this, read `registerLocalExplorerTask`" is
  a short-horizon output, not a long chain of reasoning.
- **Verification is nearly mechanical.** Given a claim and 40 lines of real
  source, deciding SUPPORTED / CONTRADICTED / INSUFFICIENT is close to a
  classification task — and wrong answers get caught, since an unsupported
  claim is dropped rather than published.
- **It is free and always warm.** A 2b model fits alongside other work on one
  GPU, answers in a second or two, and costs no quota. That is the whole point
  of this project: keep Claude's 5h/weekly budget for work that needs Claude.
- **Fan-out is cheap.** Ten small independent discovery workers at 2b cost less
  than one cloud call, and disagreement between them is itself a useful signal.

The realistic target is not "2b replaces Sonnet." It is: **2b handles the 70% of
questions that are really lookups**, the harness makes it safe to trust because
every claim is cited and checked, and the remaining 30% escalate on an explicit
`INSUFFICIENT` rather than on a guess.

The catch, and it's the real one: a 2b model must still emit a valid structured
plan in box 3. That is exactly where the current pipeline breaks for 31b cloud
models. Fix the contract first — until then, a smaller model is not the
constraint.
