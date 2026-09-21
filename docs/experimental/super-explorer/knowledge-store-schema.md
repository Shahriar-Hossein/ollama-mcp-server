# Super Explorer knowledge-store schema

This is the V1 contract for the verified-knowledge portion of
`.super-explorer/explorer.sqlite`. It stores evidence-backed findings only; it
does not replace the source index or make model output factual. The source
index remains the authority for symbols and relationships at a commit.

## Scope and identity

The database belongs to exactly one normalized repository root. IDs generated
by the writer are lowercase UUIDs. Git hashes are lowercase object IDs. File
paths are normalized, slash-separated, repository-relative paths. All writes
for one exploration result use one transaction.

`claims` are the durable units of knowledge. A claim can be positive or
negative, but it is eligible for retrieval only when its current status is
`SUPPORTED`, it has at least one evidence row, and it is not stale. A
contradicted or insufficient claim is retained for audit and future
re-evaluation, never presented as verified knowledge.

## Tables

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE repository_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  repository_root TEXT NOT NULL,
  indexed_commit TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

CREATE TABLE indexed_commits (
  commit_hash TEXT PRIMARY KEY,
  indexed_at TEXT NOT NULL
);

CREATE TABLE source_files (
  commit_hash TEXT NOT NULL REFERENCES indexed_commits(commit_hash),
  file TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (commit_hash, file)
);

CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  claim TEXT NOT NULL,
  subject_symbol_id TEXT,
  verification_status TEXT NOT NULL
    CHECK (verification_status IN ('SUPPORTED', 'CONTRADICTED', 'INSUFFICIENT')),
  resolution_quality TEXT NOT NULL
    CHECK (resolution_quality IN ('exact', 'static', 'heuristic', 'unresolved')),
  verified_commit TEXT NOT NULL REFERENCES indexed_commits(commit_hash),
  verified_at TEXT NOT NULL,
  stale_at TEXT,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (stale_at IS NULL AND stale_reason IS NULL) OR
    (stale_at IS NOT NULL AND stale_reason IS NOT NULL)
  )
);

CREATE TABLE claim_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  evidence_kind TEXT NOT NULL
    CHECK (evidence_kind IN ('source_range', 'symbol', 'relationship', 'adapter_fact', 'git_commit')),
  commit_hash TEXT NOT NULL REFERENCES indexed_commits(commit_hash),
  file TEXT,
  start_byte INTEGER,
  end_byte INTEGER,
  symbol_id TEXT,
  relationship_id TEXT,
  adapter TEXT,
  adapter_fact_id TEXT,
  git_commit_hash TEXT,
  excerpt TEXT,
  resolution_quality TEXT NOT NULL
    CHECK (resolution_quality IN ('exact', 'static', 'heuristic', 'unresolved')),
  CHECK (start_byte IS NULL OR (file IS NOT NULL AND end_byte IS NOT NULL AND start_byte >= 0 AND end_byte > start_byte)),
  CHECK (evidence_kind != 'source_range' OR (file IS NOT NULL AND start_byte IS NOT NULL AND end_byte IS NOT NULL)),
  CHECK (evidence_kind != 'symbol' OR symbol_id IS NOT NULL),
  CHECK (evidence_kind != 'relationship' OR relationship_id IS NOT NULL),
  CHECK (evidence_kind != 'adapter_fact' OR (adapter IS NOT NULL AND adapter_fact_id IS NOT NULL)),
  CHECK (evidence_kind != 'git_commit' OR git_commit_hash IS NOT NULL)
);

CREATE TABLE claim_source_files (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  PRIMARY KEY (claim_id, file)
);

CREATE TABLE indexed_symbols (
  commit_hash TEXT NOT NULL REFERENCES indexed_commits(commit_hash),
  symbol_id TEXT NOT NULL,
  file TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (commit_hash, symbol_id)
);

CREATE TABLE symbol_dependency_edges (
  commit_hash TEXT NOT NULL REFERENCES indexed_commits(commit_hash),
  dependent_symbol_id TEXT NOT NULL,
  dependency_symbol_id TEXT NOT NULL,
  resolution_quality TEXT NOT NULL
    CHECK (resolution_quality IN ('exact', 'static')),
  PRIMARY KEY (commit_hash, dependent_symbol_id, dependency_symbol_id)
);

CREATE TABLE claim_symbol_dependencies (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  symbol_id TEXT NOT NULL,
  PRIMARY KEY (claim_id, symbol_id)
);

CREATE INDEX claims_current_supported
  ON claims (verified_commit, updated_at)
  WHERE verification_status = 'SUPPORTED' AND stale_at IS NULL;
CREATE INDEX claim_evidence_claim ON claim_evidence (claim_id);
CREATE INDEX claim_source_files_file ON claim_source_files (file, claim_id);
CREATE INDEX indexed_symbols_file ON indexed_symbols (commit_hash, file);
CREATE INDEX symbol_dependency_edges_dependency
  ON symbol_dependency_edges (commit_hash, dependency_symbol_id, dependent_symbol_id);
CREATE INDEX claim_symbol_dependencies_symbol
  ON claim_symbol_dependencies (symbol_id, claim_id);
```

## Rules

- `repository_state.indexed_commit` is the active source-index commit. It is
  updated only after a successful index transaction.
- `indexed_commits` and `source_files` retain enough freshness history for
  V1 file-level invalidation. `content_hash` is SHA-256 of the file bytes.
- `claims.verified_commit` is the checkout on which verification happened;
  `claim_evidence.commit_hash` is the checkout that produced that evidence.
  They normally match, but retaining both prevents a future mixed-commit
  implementation from silently claiming fresher proof than it has.
- `claim_source_files` contains the distinct source files underlying every
  evidence row, plus any explicitly recorded source dependency. It is the
  only V1 invalidation join; do not parse claim prose to discover files.
- `claim_symbol_dependencies` contains the claim subject, symbol evidence, and
  any explicitly supplied symbol dependencies. Writers validate every ID
  against the current structural index; do not infer dependencies from claim
  prose.
- `indexed_symbols` snapshots a declaration-body hash per indexed commit.
  `symbol_dependency_edges` snapshots exact/static reference, call, and
  inheritance dependencies, directed from dependent to dependency.
- An evidence range is half-open UTF-8 byte offsets in `file` at its
  `commit_hash`. It may retain a short excerpt for display, but verification
  must re-read the source range rather than trust that excerpt.
- `resolution_quality` on a claim is the weakest quality of evidence needed
  for the claim. A claim with only `unresolved` evidence cannot be
  `SUPPORTED`; writers must reject that combination.
- `subject_symbol_id`, `symbol_id`, `relationship_id`, and `adapter_fact_id`
  are stable IDs from their respective source-index namespaces. Foreign keys
  are intentionally deferred until those source-index tables are migrated
  into SQLite; writers must validate the IDs against the index for now.

## V1 freshness behavior

After indexing a new commit, compare `source_files` for the old and new
commits. For every changed, added, or removed path, set `stale_at` and a
short `stale_reason` on matching `claim_source_files` rows. Never overwrite
`verified_commit` or evidence during invalidation. Re-verification creates
new evidence as needed, clears both stale columns, and updates verification
status and `verified_commit` atomically.

## V2 dependency freshness behavior

When a new commit is indexed, compare symbol-body hashes with the prior
snapshot. Traverse the union of the old and new exact/static dependency edges
backwards from changed symbols, so a changed callee also affects its callers
and a removed edge cannot hide stale knowledge. Mark claims that depend on
any reached symbol stale. Direct-file invalidation still runs independently.
Heuristic and unresolved edges never cause invalidation.
Snapshots and knowledge writes require a clean tracked checkout, so the
structural index and its recorded commit always describe the same bytes.

## Migration policy

Migration `1` creates the V1 tables and migration `2` adds the symbol
dependency tables. The process runs pending migrations in version order within
one transaction and refuses a database whose highest version is newer than it
supports. Never infer a table shape from `sqlite_master` or silently repair an
unknown schema. Additive schema changes receive a new migration; a changed
field meaning requires a documented data migration.
