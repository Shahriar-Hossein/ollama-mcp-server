# Super Explorer

## Goal

Build a local, repository-specific exploration system in which Qwen3.5 4B is the reasoning component, not the repository navigator. The system should answer bounded questions—where behavior lives, what writes metadata, which hooks trigger a flow, and which tests verify it—with cited, verified evidence.

The target is not “Qwen 4B equals Sonnet.” It is:

```text
Qwen 4B + repository indexes + hybrid retrieval + verification + persistent knowledge
    > a cold general-purpose explorer using grep
```

This is most realistic for symbol and file lookup, WordPress/WooCommerce wiring, caller/callee and metadata traces, relevant tests, and git history. Broad architecture discovery and ambiguous debugging remain harder problems.

## Core design

```text
Question
  │
  ├─ deterministic retrieval: lexical + semantic + structural
  ├─ repository knowledge: prior verified findings, checked for staleness
  ▼
Candidate evidence
  ▼
Small-model discovery workers
  ▼
Evidence verifier
  ▼
Cited answer + knowledge updates
```

The harness performs obvious navigation work. The model forms hypotheses, requests focused evidence where needed, checks whether each claim is supported, and writes the answer. It must not infer implementation merely from names or unverified search results.

Use call budgets instead of a fixed turn count: for example, 3 calls for simple lookup, 8 for a normal trace, and 15 for a deep bounded trace. Prefer many small, focused observations to a few large file dumps.

## Universal index and framework adapters

The core index is framework-agnostic. It records source-derived files,
symbols and definitions, references, imports and dependencies, inheritance,
caller/callee edges, tests, and Git history. Generic exploration tools query
that universal index:

- `find_symbol`, `find_references`, `find_callers`, `find_callees`, `trace_symbol`
- `outline_file`, `read_symbol`, `related_files`
- `find_tests_for_symbol`, `find_tests_matching_behavior`, `run_test`
- `git_find_introduction`, `git_find_recent_changes`, `git_blame_symbol`

Framework adapters add domain-specific facts and tools without making them
part of the core API. The initial adapter is WordPress/WooCommerce and
supplies hook, metadata/options, REST, AJAX, shortcode, cart, and price
mutation extraction. Laravel, React/Next, Nest/Node, and later adapters use
the same boundary.

## Retrieval and exploration tools

Precompute a repository map and expose high-level tools rather than making the model rediscover relationships with raw search:

- WordPress/WooCommerce: `find_hooks`, `find_hook_registration`, and `find_hook_emitters`
- WordPress/WooCommerce: `find_postmeta_reads`, `find_postmeta_writes`, `find_option_reads`, and `find_option_writes`
- WordPress/WooCommerce: `find_rest_route`, `find_ajax_handler`, `find_shortcode`, and `find_wc_price_mutations`

`read_file` remains available as a fallback. The normal sequence is `outline_file` first, then `read_symbol` with only immediate dependencies and relevant callers.

Hybrid retrieval runs automatically and merges candidates with Reciprocal Rank Fusion (or an equivalent ranking method):

- lexical search for exact identifiers, strings, and paths;
- semantic search over symbols, docblocks, and code chunks;
- structural search through symbols, calls, hooks, metadata, tests, and path proximity.

## Repository map and domain index

Index the repository before exploration. Tree-sitter extracts syntax and
symbols. An LSP or language-specific static analyzer resolves semantic
relationships when available; conservative heuristics provide a fallback.
Tree-sitter alone must not be treated as reliable cross-file reference or call
resolution. Every relationship records `resolution` as `exact`, `static`,
`heuristic`, or `unresolved`.

Every source entity uses the stable identity specified in
[the symbol-record schema](symbol-schema.md) before relationships are added.
The identity survives ordinary line movement; relationships, knowledge,
history, invalidation, and rename handling must refer to it rather than to a
source range alone.

The universal index extracts files, symbols, signatures, imports,
dependencies, inheritance, references, call edges, tests, and Git history.
The WordPress/WooCommerce adapter then extracts hook registration/emission,
metadata and options, REST routes, AJAX handlers, shortcodes, cart hooks, and
price mutation APIs.

The resulting map should connect:

```text
concept → subsystem → files → symbols → callers/callees
        → hooks → metadata/options → tests → commits
```

Create precomputed execution traces for frequent flows where useful, such as add-to-cart, price recalculation, and order creation. These are retrieval aids, not unquestioned truth: the active commit still determines the final answer.

## Evidence pipeline

1. Classify the question and retrieve candidates automatically.
2. Run independent, tightly scoped workers for exact/hook tracing, call-graph tracing, and conceptual search. They return hypotheses and required evidence, never final answers.
3. Retrieve the requested code artifacts.
4. Verify every claim as `SUPPORTED`, `CONTRADICTED`, or `INSUFFICIENT`.
5. Synthesize only supported claims into a concise cited answer.
6. Save verified reusable findings as knowledge updates.

Independent retrieval paths are useful; duplicate reasoning is not. The final answer should identify implementation, relevant entry points, and tests or history when those are directly verified.

## Persistent repository knowledge

Every successful exploration should leave structured knowledge behind. Store
verified concepts, subsystem membership, files, symbols, call relationships,
adapter facts, tests, execution traces, and useful history. Store failed or
contradicted hypotheses separately so they are not treated as facts. A
knowledge record is provenance-first, for example:

```text
claim
evidence[]
verification_status
resolution_quality
verified_commit
```

Do not treat a model-generated numeric confidence as evidence. A score may be
derived later for ranking, but source-backed `SUPPORTED` claims are the durable
unit of knowledge.

Attach the indexed commit hash to each record. V1 invalidation compares changed
paths and marks records whose source files changed as stale. Later, propagate
from changed symbol IDs through the dependency graph to mark affected findings
stale—for example, a finding about a caller can be affected by a change in a
transitive callee. Do not simulate memory by putting old conversations into
prompts: use an external, queryable store.

Each run should produce both:

```json
{
  "answer_to_user": "...",
  "knowledge_updates": []
}
```

This is the compounding mechanism: later explorations begin with verified orientation and focus on the unknown gaps.

## Delivery roadmap

## Session checklist

Complete these in order. Keep each session focused on one unchecked item; record the result, validation command, and next item in the PR/commit or session handoff.

- [x] Define the first benchmark questions and their gold files, symbols, and relationships. See [the initial benchmark set](benchmarks.md).
- [x] Choose the on-disk format and location for generated explorer data; add it to `.gitignore` if it is reproducible. See [storage](storage.md).
- [x] Define stable symbol identities and a symbol-record schema (file, language, kind, name, range, signature, parent). See [the symbol-record schema](symbol-schema.md).
- [x] Build an indexer that discovers supported source files and emits symbol records. Run `npm run --silent index:super-explorer -- <repository-root>`; the initial implementation supports TypeScript/TSX and JavaScript module formats.
- [x] Add `outline_file(path)` backed by the symbol index. Run `npm run --silent outline:super-explorer -- <repository-root> <path>`; it returns a hierarchical declaration outline without source bodies.
- [x] Add `read_symbol(symbol)` with source ranges and minimal surrounding context. Run `npm run --silent read-symbol:super-explorer -- <repository-root> <symbol-id>` with an ID returned by `outline_file`.
- [x] Extract and index references, dependencies, inheritance, and caller/callee edges; record `exact`, `static`, `heuristic`, or `unresolved` resolution quality.
- [x] Add `find_symbol`, `find_references`, `find_callers`, and `find_callees`. Run `npm run --silent structural:super-explorer -- find-symbol <repository-root> <name-or-id>`; use a returned ID with `find-references`, `find-callers`, or `find-callees`.
- [x] Define the framework-adapter interface and keep generic structural tools independent of adapters. See [framework adapters](framework-adapters.md).
- [x] Extract WordPress/WooCommerce hooks and connect registrations and emitters to their containing symbols. Run `npm run --silent wordpress-hooks:super-explorer -- <repository-root>`; the current generic JS/TS index supports literal hook names in those languages.
- [x] Add metadata/options reads and writes to the domain index. The WordPress/WooCommerce adapter emits source-backed metadata and option facts for the supported JavaScript/TypeScript APIs, including unresolved computed keys.
- [x] Add REST routes, AJAX handlers, shortcodes, cart hooks, and price-mutation extraction. The WordPress/WooCommerce adapter emits literal source-backed facts for the supported JavaScript/TypeScript APIs; dynamic route, shortcode, and hook names remain unresolved.
- [x] Index tests and provide source-to-test lookup. Conventional JS/TS test files yield source-backed test-to-symbol edges; run `npm run --silent structural:super-explorer -- find-tests-for-symbol <repository-root> <symbol-id>`.
- [x] Add git-history lookups for files and symbols. Run `npm run --silent git-history:super-explorer -- <file-introduction|symbol-introduction|file-recent-changes|symbol-recent-changes|blame-symbol> <repository-root> <file-or-symbol-id> [limit]`; file history follows renames, and symbol history/blame uses its indexed source range.
- [x] Add semantic embeddings and local similarity search. Start Ollama with embedding support and pull an embedding model (the default is `nomic-embed-text-v2-moe`, overridable with `SUPER_EXPLORER_EMBEDDING_MODEL`), then run `npm run --silent semantic:super-explorer -- index <repository-root> [model]` and `npm run --silent semantic:super-explorer -- search <repository-root> <query> [limit] [model]`. Symbol-source embeddings are stored locally, tagged with their Ollama model and indexed commit, and rebuilt when either changes.
- [x] Implement hybrid retrieval and rank merging; compare it with lexical-only retrieval on the benchmark. Run `npm run --silent hybrid:super-explorer -- lexical <repository-root> <query>` for the source-symbol baseline, then replace `lexical` with `hybrid`. Hybrid fuses lexical, semantic, and structural symbol rankings with documentation, package-script, and Git-commit evidence. The full 12-question top-10 benchmark on 2026-09-16 with `nomic-embed-text-v2-moe` improved aggregate evidence recall from 68.1% (lexical) to 84.7% (hybrid), with zero unsupported retrieval results in either run. It returns the required SE-09 benchmark document, SE-11 introduction commit and changed source files, and SE-12 `package.json` test script. Raw results are in the ignored `benchmark-data/super-explorer-hybrid-2026-09-16/`; rerun with `npm run --silent benchmark:hybrid:super-explorer -- <lexical|hybrid> <repository-root> [limit] [embedding-model]`.
- [x] Define the SQLite knowledge-store schema, including claims, evidence, verification status, resolution quality, verified commit, and stale state. See [the knowledge-store schema](knowledge-store-schema.md).
- [x] Save verified exploration findings as knowledge updates. Run `npm run --silent knowledge:super-explorer -- <repository-root> <updates-json-file>` with an array of source-backed verification outcomes, or use the `save_knowledge_updates` MCP tool. Writes are one SQLite transaction; `SUPPORTED` claims reject unresolved evidence, while contradicted and insufficient outcomes remain for audit.
- [x] Invalidate knowledge whose direct source files change between commits (V1). Run `npm run --silent knowledge:super-explorer -- refresh <repository-root>` or use `refresh_knowledge_freshness`; it snapshots tracked files at the current commit and marks matching claims stale in one transaction. Saving later updates runs the same invalidation comparison before writing new verification outcomes. Both require a clean tracked checkout.
- [x] Propagate invalidation from changed symbols through dependencies to affected knowledge records. The knowledge store snapshots declaration-body hashes and exact/static reference, call, and inheritance edges; refresh traverses reverse dependencies across the old and new graphs. Use `symbol_dependencies` on a knowledge update for additional validated claim dependencies.
- [x] Implement the discovery stage: hypotheses plus required evidence, with no final answer. Run `npm run --silent discover:super-explorer -- <repository-root> <question> [model]` or use `discover_evidence`. It fuses retrieval candidates with a constrained local-model plan and accepts only JSON containing tentative hypotheses, concrete required evidence, and retrieval gaps; verification and synthesis remain separate stages.
- [x] Implement the verification stage: `SUPPORTED`, `CONTRADICTED`, or `INSUFFICIENT` per claim. Run `npm run --silent verify:super-explorer -- <repository-root> <claims-json-file> [model]` or use `verify_claims`. It materializes caller-supplied symbol, source-range, or Git-commit evidence at the indexed commit, then rejects a `SUPPORTED` result that does not cite supplied evidence. It does not retrieve missing evidence or synthesize an answer.
- [ ] Implement cited synthesis that emits only verified claims.
- [ ] Measure baseline accuracy, unsupported-claim rate, tool calls, token use, and latency.
- [ ] Add parallel discovery workers only if the benchmark shows a worthwhile improvement.
- [ ] Consider LoRA only after the pipeline and benchmark are stable and enough clean trajectories exist.

### 1. Universal indexing foundation

Build stable symbol IDs and the Tree-sitter syntax/symbol map. Add semantic
resolution through LSP/static analyzers when available and clearly-labelled
heuristics otherwise. Index generic references, dependencies, inheritance,
calls, tests, and Git history.

### 2. Generic structural tools and framework adapters

Expose `outline_file`, `read_symbol`, and generic structural queries. Define
the adapter interface, then implement WordPress/WooCommerce as its first
consumer.

### 3. Retrieval harness

Add lexical and semantic retrieval; merge it with structural results so
context stays small and relevant.

### 4. Knowledge store

Use SQLite or a lightweight graph-backed store for provenance-backed verified
findings, traces, commit hashes, and file-level staleness invalidation. Add
dependency-aware invalidation after the graph is dependable.

### 5. Evidence agent

Add the bounded discovery, verification, synthesis, and knowledge-writeback stages. Start with one worker per retrieval specialty; add parallelism only when benchmark results show it improves accuracy enough to justify the latency and hardware use.

### 6. Benchmark before training

Create about 50 real repository questions covering symbol location, hooks/metadata, call chains, cross-file behavior, tests, and history. Record gold files, symbols, lines, and required relationships. Measure file and symbol recall, evidence precision, unsupported-claim rate, tool calls, tokens, and latency.

Fine-tune only after the retrieval pipeline is stable and there are enough clean trajectories. A LoRA, if needed, should teach tool selection, observation parsing, evidence classification, and structured reporting—not general repository knowledge.

## Success criteria

Judge the system by benchmarked retrieval accuracy and verified answers, not by how impressive the prose sounds. A useful initial target is high recall for gold files and symbols, no unsupported claims in final reports, and a bounded context/token budget per exploration.
