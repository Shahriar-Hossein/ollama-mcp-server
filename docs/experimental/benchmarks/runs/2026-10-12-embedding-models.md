# Embedding model comparison — 2026-10-12

Hybrid retrieval on the SE-01..SE-12 gold set, one model at a time.

- Command: `benchmark:hybrid:super-explorer` (`hybrid`, limit 10), run against this repo at `6bf8a1c`, not the pinned fixture commit.
- No query/document prefixes except nomic's `search_query:`/`search_document:`.
- Small sample (12 questions, one repo). Treat gaps as hints, not proof.
- `embeddinggemma-2` was not tested: Ollama 0.40.3 refuses it ("requires MLX support").

## Results

| Rank | Model | Recall@10 | Recall@3 | Recall@5 | MRR | Run time |
|---|---|---|---|---|---|---|
| 1 | qwen3-embedding:4b | 0.833 | 0.764 | 0.806 | 0.833 | 2470 s (2077 s after `num_ctx` fix) |
| 2 | qwen3-embedding:0.6b | 0.750 | 0.681 | 0.722 | 0.806 | 684 s |
| 3 | nomic-embed-text-v2-moe | 0.750 | 0.611 | 0.681 | 0.743 | 664 s |
| 4 | embeddinggemma:300m | 0.750 | 0.653 | 0.722 | 0.701 | not saved |
| — | lexical only | 0.611 | 0.375 | 0.514 | 0.336 | — |

Rank is by MRR. Gemma beats nomic on recall@3/@5 but not MRR.

## Per question (evidence recall)

| Q | lexical | nomic | gemma 300m | qwen3 0.6b | qwen3 4b |
|---|---|---|---|---|---|
| SE-01 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| SE-02 | 0.67 | 0.33 | 0.33 | 0.33 | 0.33 |
| SE-03 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| SE-04 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| SE-05 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| SE-06 | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 |
| SE-07 | 0.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| SE-08 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| SE-09 | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 |
| SE-10 | 0.00 | 0.00 | 0.00 | 0.00 | 1.00 |
| SE-11 | 0.67 | 0.67 | 0.67 | 0.67 | 0.67 |
| SE-12 | 0.00 | 1.00 | 1.00 | 1.00 | 1.00 |

## 4b CPU spill (fixed after this run)

The first `qwen3-embedding:4b` run (2470 s) partly spilled to CPU. The daemon's
`OLLAMA_CONTEXT_LENGTH=16384` applied to the embedder, and `embed()` set no `num_ctx`.

After the fix the same run took 2077 s (about 16% faster) with identical scores
(recall 0.833, MRR 0.833, same per-question results). The spill was a minor part
of the slowness; the 4b model is just slow to index on this GTX 1660 SUPER.

| `num_ctx` | Memory | Placement |
|---|---|---|
| 16384 | 5.5 GB | 18% CPU / 82% GPU |
| 4096 | 4.1 GB | 100% GPU |
| 2048 | 3.9 GB | 100% GPU |

- `embed()` now sends `num_ctx: 4096`. Symbol text is capped at 1,600 characters, so this is plenty.
- At 4096: weights 2375 MiB, KV 306 MiB (q8_0), compute buffer 1221 MiB (from the Ollama log).
- The compute buffer comes from `n_ubatch = 2048`, which embedding models use. It barely changes with `num_ctx`.
  Lowering `num_batch` might shrink it; not tested.
- The other three runs were not checked for spill; nomic and the 0.6b/300m models are small enough that it is unlikely.

## Notes

- All embedding models fix SE-07 and SE-12 over lexical. Only 4b fixes SE-10.
- SE-02, SE-06, SE-09, SE-11 fail for every model, so they point at retrieval/fusion, not the embedder.
- Run time is mostly first-time symbol indexing; query-time cost was not measured separately.
- Next: try qwen3 query instructions and gemma task prefixes in `embeddingInput()`.

## Default

The default is now `qwen3-embedding:0.6b`: better ranking than nomic at similar indexing time.
`qwen3-embedding:4b` scored highest but indexes about 3x slower; select it with `SUPER_EXPLORER_EMBEDDING_MODEL`.
