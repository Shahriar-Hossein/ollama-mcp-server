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

## Retrieval and exploration tools

Precompute a repository map and expose high-level tools rather than making the model rediscover relationships with raw search:

- `find_symbol`, `find_references`, `find_callers`, `find_callees`, `trace_symbol`
- `find_hooks`, `find_hook_registration`, `find_hook_emitters`
- `find_postmeta_reads`, `find_postmeta_writes`, `find_option_reads`, `find_option_writes`
- `find_rest_route`, `find_ajax_handler`, `find_shortcode`, `find_wc_price_mutations`
- `outline_file`, `read_symbol`, `related_files`
- `find_tests_for_symbol`, `find_tests_matching_behavior`, `run_test`
- `git_find_introduction`, `git_find_recent_changes`, `git_blame_symbol`

`read_file` remains available as a fallback. The normal sequence is `outline_file` first, then `read_symbol` with only immediate dependencies and relevant callers.

Hybrid retrieval runs automatically and merges candidates with Reciprocal Rank Fusion (or an equivalent ranking method):

- lexical search for exact identifiers, strings, and paths;
- semantic search over symbols, docblocks, and code chunks;
- structural search through symbols, calls, hooks, metadata, tests, and path proximity.

## Repository map and domain index

Index the repository before exploration. Use Tree-sitter for supported languages to extract files, symbols, signatures, inheritance, references, and call edges. Add WordPress/WooCommerce extraction for hook registration/emission, metadata and options, REST routes, AJAX handlers, shortcodes, cart hooks, and price mutation APIs. Index tests and git history as additional evidence sources.

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

Every successful exploration should leave structured knowledge behind. Store verified concepts, subsystem membership, files, symbols, call relationships, hooks, metadata, tests, execution traces, and useful history. Store failed or contradicted hypotheses separately so they are not treated as facts.

Attach the indexed commit hash to each record. On a new commit, compare changed paths and mark affected records stale; reuse unchanged knowledge but re-check anything connected to changed code. Do not simulate memory by putting old conversations into prompts: use an external, queryable store.

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
- [x] Define a stable symbol-record schema (file, language, kind, name, range, signature, parent). See [the symbol-record schema](symbol-schema.md).
- [x] Build an indexer that discovers supported source files and emits symbol records. Run `npm run --silent index:super-explorer -- <repository-root>`; the initial implementation supports TypeScript/TSX and JavaScript module formats.
- [ ] Add `outline_file(path)` backed by the symbol index.
- [ ] Add `read_symbol(symbol)` with source ranges and minimal surrounding context.
- [ ] Extract and index symbol references and caller/callee edges where they can be resolved safely.
- [ ] Add `find_symbol`, `find_references`, `find_callers`, and `find_callees`.
- [ ] Extract WordPress/WooCommerce hooks and connect registrations and emitters to their containing symbols.
- [ ] Add metadata/options reads and writes to the domain index.
- [ ] Add REST routes, AJAX handlers, shortcodes, cart hooks, and price-mutation extraction as needed by the benchmark.
- [ ] Index tests and provide source-to-test lookup.
- [ ] Add git-history lookups for files and symbols.
- [ ] Add semantic embeddings and local similarity search.
- [ ] Implement hybrid retrieval and rank merging; compare it with lexical-only retrieval on the benchmark.
- [ ] Define the SQLite knowledge-store schema, including evidence, confidence, commit hash, and stale state.
- [ ] Save verified exploration findings as knowledge updates.
- [ ] Invalidate or re-check knowledge when indexed files change between commits.
- [ ] Implement the discovery stage: hypotheses plus required evidence, with no final answer.
- [ ] Implement the verification stage: `SUPPORTED`, `CONTRADICTED`, or `INSUFFICIENT` per claim.
- [ ] Implement cited synthesis that emits only verified claims.
- [ ] Measure baseline accuracy, unsupported-claim rate, tool calls, token use, and latency.
- [ ] Add parallel discovery workers only if the benchmark shows a worthwhile improvement.
- [ ] Consider LoRA only after the pipeline and benchmark are stable and enough clean trajectories exist.

### 1. Indexing foundation

Build the Tree-sitter symbol map, reference/call graph, WordPress/WooCommerce extractor, test links, and git-history lookups. Add a local embedding index for semantic retrieval.

### 2. Retrieval harness

Expose lexical, semantic, and structural primitives; merge their results; and add `outline_file` and `read_symbol` so context stays small and relevant.

### 3. Knowledge store

Use SQLite or a lightweight graph-backed store for verified findings, traces, commit hashes, and staleness invalidation.

### 4. Evidence agent

Add the bounded discovery, verification, synthesis, and knowledge-writeback stages. Start with one worker per retrieval specialty; add parallelism only when benchmark results show it improves accuracy enough to justify the latency and hardware use.

### 5. Benchmark before training

Create about 50 real repository questions covering symbol location, hooks/metadata, call chains, cross-file behavior, tests, and history. Record gold files, symbols, lines, and required relationships. Measure file and symbol recall, evidence precision, unsupported-claim rate, tool calls, tokens, and latency.

Fine-tune only after the retrieval pipeline is stable and there are enough clean trajectories. A LoRA, if needed, should teach tool selection, observation parsing, evidence classification, and structured reporting—not general repository knowledge.

## Success criteria

Judge the system by benchmarked retrieval accuracy and verified answers, not by how impressive the prose sounds. A useful initial target is high recall for gold files and symbols, no unsupported claims in final reports, and a bounded context/token budget per exploration.
