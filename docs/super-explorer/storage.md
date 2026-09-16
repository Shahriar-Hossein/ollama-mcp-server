# Super Explorer storage

Generated Super Explorer state lives at the repository root:

```text
.super-explorer/
  explorer.sqlite
  embeddings/                 # optional vector-index sidecars
```

The directory is ignored by Git. It is machine-local derived state, tied to a
particular checkout and embedding model; rebuilding it must be supported.
Benchmark requests and their raw outputs stay in the existing gitignored
`benchmark-data/` directory instead.

## Format

Use one SQLite database at `.super-explorer/explorer.sqlite` for the
repository map and the later verified-knowledge store. SQLite gives the index
one transactional, queryable home for symbols, edges, hooks, files, commit
metadata, evidence, and staleness state. It also avoids having separate JSON
files drift out of sync when an index refresh changes several relationships.

Use SQLite's FTS support for lexical search when the indexer needs it. Keep a
vector engine's model-specific files under `.super-explorer/embeddings/`; the
database records the embedding model, dimensions, source commit, and sidecar
identifier needed to decide whether those files can be reused.

The initial local sidecar is a JSON file named for its embedding model. It
contains normalized vectors for each indexed symbol's signature, source body,
and immediately preceding docblock. It is reusable only when its schema
version, model, and indexed commit all match the current request. Semantic
results return source symbol IDs and ranges, not asserted facts; callers must
still read and verify the cited source.

This decision deliberately does not define tables yet. The next schema task
will specify stable symbol records first, then add map and knowledge tables
with explicit migrations. Until then, no code may treat undocumented SQLite
tables as a public interface.

## Lifecycle

1. Resolve the repository root, then create `.super-explorer/` there.
2. Store the indexed `HEAD` commit in the database on every successful index.
3. On startup, compare that commit with the current checkout. Refresh changed
   source-derived rows and mark affected verified knowledge stale before it is
   returned as evidence.
4. A user can safely delete `.super-explorer/` to force a full rebuild. Do not
   delete `benchmark-data/` as part of that operation.

The path is repository-relative, not relative to the MCP server process, so a
tool invocation can index the `cwd` it was asked to explore without mixing
state from another project.
