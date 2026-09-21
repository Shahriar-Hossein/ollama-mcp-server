# Explorer answer-relaxation checklist

## Goal

Let Codex or Claude Code receive a useful best-effort answer from a local or
cloud Explorer model even when that model cannot produce a rigid schema,
citations, confidence wording, or verifier-supported claims. Keep the
read-only repository and security boundaries intact.

Work through these in order. Mark a box only after its completion evidence is
recorded in the PR, commit, or a short note beneath the task.

## 1. Establish the current behavior

- [ ] Add focused tests for the current result behavior when a model returns:
  ordinary prose, malformed structured output, no citations, unsupported
  claims, and empty content.
  - Done when: each case has an explicit expected outcome, including the
    current reject/abstain behavior where applicable.

- [ ] Trace and document the answer path through
  `src/experimental/explorer/explore.ts`, `discovery.ts`, `synthesis.ts`, and
  `verification.ts`.
  - Done when: the document identifies which stage transforms, rejects,
    abstains from, or suppresses a model answer.

## 2. Define the caller-facing contract

- [ ] Define two answer modes: `raw` (best-effort) and `verified`
  (evidence-gated).
  - Done when: input and result TypeScript types state the default, fallback
    behavior, and metadata supplied by each mode.

- [ ] Define a shared result shape for local and cloud models.
  - Include: `answer`, `model`, `mode`, `warnings`, optional evidence, and
    optional verification status.
  - Done when: callers do not need provider-specific parsing to display an
    answer.

- [ ] Decide the default deliberately.
  - Recommended: assistant-facing Explorer calls default to `raw`; benchmark
    and high-assurance callers opt into `verified`.
  - Done when: the chosen default and compatibility impact are documented in
    the MCP tool description and relevant docs.

## 3. Implement a minimal raw-answer path

- [ ] In `explore.ts`, create the minimal path: retrieve/read context → ask
  the model → return its natural-language answer.
  - Done when: a non-empty answer reaches the caller without requiring
    discovery, synthesis, or verification to succeed.

- [ ] Make optional enrichment non-blocking.
  - Discovery, semantic search, Git history, framework adapters, synthesis,
    and verification may enrich a result, but their failure must add a warning
    rather than discard a usable raw answer.
  - Done when: tests prove a raw answer still returns if every optional stage
    is disabled or fails.

- [ ] Preserve useful model output verbatim.
  - Done when: prose without a prescribed `FINAL ANSWER` section, JSON shape,
    citation layout, or confidence label is returned as the answer rather than
    treated as invalid.

## 4. Relax structured pipeline requirements

- [ ] Update `discovery.ts` to treat structured extraction as best-effort.
  - Done when: unparseable or incomplete discovery output becomes a warning
    and optional raw context, not a pipeline failure.

- [ ] Update `synthesis.ts` to accept ordinary prose as a successful answer.
  - Done when: failed fact/relationship extraction cannot replace the model's
    answer with abstention.

- [ ] Update `verification.ts` to annotate instead of gate in `raw` mode.
  - Done when: verification exposes supported/unsupported evidence and
    warnings, but does not suppress the answer. `verified` mode retains its
    strict behavior.

## 5. Make the local tool loop resilient

- [ ] Simplify the final-answer prompt in
  `src/experimental/tools/local-explorer-task.ts`.
  - Ask for a useful answer with file references when available; do not demand
    a report template or a special confidence format.
  - Done when: `qwen3.5:4b` can return plain prose successfully in the tool
    loop.

- [ ] Handle a model's empty final message explicitly.
  - Done when: callers receive a clear partial/failure result with tool-call
    count and files read, rather than an apparently successful blank answer.

- [ ] Return operational metadata independently of the model's wording.
  - Include: tool-call count, files read, elapsed time, limits hit, and model
    name.
  - Done when: a caller can judge whether to retry without parsing prose.

## 6. Keep non-negotiable controls strict

- [ ] Preserve repository-root checks, read-only file access, ignored
  directories, and safe AST-grep invocation.
  - Done when: existing path-escape and command-injection protections remain
    covered by tests.

- [ ] Preserve tool-call, distinct-file, output-size, context, and timeout
  budgets.
  - Done when: relaxed answer handling cannot make a model loop unbounded.

- [ ] Preserve feature flags and autonomous-tool gates in `features.ts` and
  `index.ts`.
  - Done when: raw-answer work does not accidentally enable experimental or
    shell-capable tools by default.

## 7. Validate the change with real callers

- [ ] Run the existing Explorer gold questions in both modes.
  - Done when: results distinguish answer usefulness from verifier-supported
    correctness; do not report raw-mode answers as verified passes.

- [ ] Run a small set of real Codex/Claude Code repository questions against
  `qwen3.5:4b` and one cloud model.
  - Done when: the record captures raw answer usefulness, citations when
    present, warnings, latency, and any empty-answer failures.

- [ ] Update `docs/README.md`, `docs/project-map.md`, and relevant tool
  descriptions for the final supported surface.
  - Done when: documentation clearly tells callers when to use `raw` versus
    `verified` and does not make stale reliability claims.

## Completion criteria

- [ ] A weak local model can return a useful prose answer without satisfying a
  rigid schema.
- [ ] A caller can request strict verification when it actually needs it.
- [ ] Safety boundaries and resource limits are unchanged and tested.
- [ ] The default behavior and all warnings are understandable without reading
  implementation code.
