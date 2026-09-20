# Cost-aware agent workflow

**Goal:** preserve the strong agent for decisions, integration, and review; use the local Ollama MCP server or a bounded Ollama cloud call for work whose answer can be checked cheaply. This is a routing proposal, not a claim that a small model replaces a parent agent or that every local/cloud call is free.

## What “commit” means in a normal Codex/Claude workflow

A good commit is the end of a small control loop, not merely `git commit`:

1. Understand the requested outcome and repository constraints.
2. Inspect the existing state and decide the exact files that belong together.
3. Make the change and run the relevant checks.
4. Review the diff for scope, regressions, secrets, and accidental files.
5. Stage only the approved paths, create a focused message, then verify the resulting commit with `git show --stat` and `git status --short`.

In Codex, Git controls can stage hunks or files, commit, push, and open a PR; the diff is intended for review before publishing. The official guidance also recommends Git checkpoints around work and a review of uncommitted changes, commits, or a base branch before commit/PR. [Codex local environments](https://developers.openai.com/docs/environments/local-environment) and [Codex CLI](https://developers.openai.com/docs/codex/cli)

For this repository, creating a commit is an external state change. A model may prepare evidence and a proposed message, but the final stage/commit should run only after the user has requested it and the exact path set is known.

## Where a cheap worker fits in that loop

| Commit step | Best owner | Cheap route and boundary |
| --- | --- | --- |
| Find likely files, symbols, tests, and recent related commits | local scout first | `local_explorer_task` with a small, read-only budget. Treat citations as leads; parent verifies them. |
| Condense a log, diff, test output, or many similar errors | local generation | `run_ollama_task` using `qwen3.5:4b`; return a short summary plus exact failing excerpts/locations. Do not make the parent read the full artifact first. |
| Draft a commit message from an already-reviewed diff | local generation | A one-shot local call. The parent checks that the message neither hides unrelated changes nor claims unverified behavior. |
| Mechanical, narrowly specified code draft | local generation | `qwen3.5:4b`; require a small output contract and run tests/diff review afterward. |
| Bounded code task needing a better first draft | cheap cloud | `gemma4:31b-cloud`, one bounded prompt or tool loop, then parent test/review. It is a candidate, not a general routing default. |
| Exact staging + commit | deterministic executor, after approval | Prefer a fixed operation over free-form agentic Git. If the opt-in local worker is used, bind it to explicit paths and message; independently check the resulting commit and clean status. |
| Decide scope, security impact, architecture, or whether to commit | parent agent + user | Do not delegate. These are judgment calls with costly failure modes. |
| Review final diff, test failures, or publish/push | parent agent + user | Do not delegate final acceptance. A cheap model can provide a second-pass checklist only. |

The important design is **worker produces a bounded artifact; deterministic check or strong parent accepts it**. Do not pass a cheap worker’s prose directly into a commit, architecture decision, or security change.

## Suggested model routing for ordinary work

| Work shape | First route | Escalate when | Keep with parent from the start |
| --- | --- | --- | --- |
| File/symbol discovery in a known repository | `local_explorer_task`; start around 16 calls / 6 files | No final answer, low confidence, bad citations, or a 32-call retry fails | The answer will drive a security or architecture decision. |
| Parsing, extraction, summaries, repetitive transforms | `qwen3.5:4b`, `think:false` | Output cannot be deterministically checked, or it loses a critical caveat | The source is sensitive or the summary is itself a decision. |
| Tiny throwaway code or test scaffolding | `qwen2.5-coder:3b`, one-shot only | It needs tool calls, repo navigation, or test repair | Production change with non-obvious constraints. |
| Precise, spec-sensitive repair | `granite4.2:3b`, `think:true`, large output budget | Test/diff fails or runtime is unsuitable | Security, destructive migration, or broad refactor. |
| Bounded implementation that benefits from stronger drafting | `gemma4:31b-cloud`, bounded context | Citations/code/tests need substantial repair | Multi-step repository architecture or high-consequence choice. |
| Git inspection / exact mechanical commit | A fixed allowlisted local worker only after explicit approval | Any unexpected staged path, option, or claimed result | Amend, reset, push, conflict resolution, or any unclear scope. |

Do not route a task merely because it is short. Route it only when input and output are bounded, independent validation is cheap, failure is recoverable, and the parent will not have to redo the same investigation.

## Evidence from this repository

The 2026-09-19 scout comparison is encouraging for narrow read-only work, but not a blanket reliability result:

- `gemma4:31b-cloud` produced the best observed scout lead in that one comparison (8 tool calls, 15 seconds). `ministral-3:3b` was the fastest completing local scout but made a material false statement. Both require citation verification. [Explorer scout comparison](benchmarks/runs/2026-09-19-explorer-scout-comparison.md)
- The broader worker fixture recommends `qwen3.5:4b` for extraction, summaries, and mechanical work; `granite4.2:3b` with thinking for spec-sensitive fixes; and `gemma4:31b-cloud` for bounded code that needs cloud quality. These are tested fixture families, not universal guarantees. [Benchmark master record](benchmarks/MASTER.md)
- A direct, minimal local Git tool loop using `qwen3.5:4b` correctly staged and committed two explicit files in 10 seconds. The full Claude-style harness took 5–7.5 minutes for trivial tasks and once claimed a commit that it had not made. Every delegated Git result was checked with `git log` and `git status`; retain that rule. [Local worker experiment](planning/local-claude-worker-experiment.md)
- The project audit found that several apparent Super Explorer success counts were non-error counts rather than supported answers. It recommends measuring worker execution *plus* validation and parent repair, rather than claiming quota savings from model size, latency, or a local endpoint alone. [Project reality check](planning/project-reality-check-2026-09-19.md)

The available project conversation records both a Codex and Claude exchange about durable, serial benchmark execution. They support a practical split: Codex identified the execution-environment constraint; Claude supplied a filesystem-observable supervisor pattern; the resulting outputs were still checked against logs and process state. I did not find an independent local Claude chat archive to treat as additional evidence, so this document does not claim to have reviewed private Claude history beyond that checked-in conversation. [Agent conversation](agent-conversation.md)

## Operating policy

1. Ask the parent to write a compact task contract: input paths/artifact, required output, allowed tools, maximum turns, and validation command.
2. Use a local one-shot call for drafting/extraction. Use the read-only scout only for navigation. Use a cloud call only when the expected improvement is worth the privacy, availability, and rate-limit tradeoff.
3. Return evidence, not just prose: paths/lines, exact errors, changed files, test output, and an explicit confidence/failure state.
4. Validate independently. For Git: verify changed paths, commit contents, and clean/expected status. For code: run focused tests and inspect the diff. For summaries: preserve critical excerpts.
5. Escalate once rather than repeatedly spending turns. A failed 16-call scout can receive one bounded retry; then the parent investigates.
6. Record accepted results, retries, parent repair time, and actual token or quota data when available. Only that end-to-end measure can demonstrate a real cost reduction.

## Near-term implementation priorities

- Keep `local_explorer_task` read-only, source-scoped, and citation-checked. Add deterministic navigation helpers before increasing tool budgets.
- Make the useful delegation routes return timing/token fields and a compact evidence artifact. The current client discards some Ollama telemetry.
- For commits, tighten the local worker around fixed operations and explicit paths. Refuse unexpected staged files and verify exact commit contents; never treat a broad `git commit` allowlist as sufficient scope control.
- Evaluate one real repeated task family end-to-end—for example, extracting CI failure ledgers—against direct parent work before expanding the system.
