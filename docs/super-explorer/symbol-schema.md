# Super Explorer symbol-record schema

This is the stable, source-derived contract between an indexer and the
retrieval tools. One record represents one named declaration in one file at
one indexed commit. It is not a claim about runtime dispatch, references, or
call edges; those belong to later index records.

## Record shape

```json
{
  "schema_version": 1,
  "id": "symbol:sha256:...",
  "repository_root": ".",
  "commit_hash": "40-or-64-hex-object-id",
  "file": "src/tools/local-explorer-task.ts",
  "language": "typescript",
  "kind": "function",
  "name": "registerLocalExplorerTask",
  "qualified_name": "registerLocalExplorerTask",
  "parent_id": null,
  "range": {
    "start": { "line": 42, "column": 1, "byte": 1536 },
    "end": { "line": 121, "column": 2, "byte": 4857 }
  },
  "selection_range": {
    "start": { "line": 42, "column": 17, "byte": 1552 },
    "end": { "line": 42, "column": 41, "byte": 1576 }
  },
  "signature": "function registerLocalExplorerTask(server: McpServer): void"
}
```

All fields are required except `parent_id`, which is `null` for a top-level
symbol. `qualified_name` is required even when it equals `name`.

## Field rules

| Field | Contract |
| --- | --- |
| `schema_version` | Positive integer. Version `1` is this document. A change to semantics or a required field needs a new version and an explicit migration. |
| `id` | Stable content identity: `symbol:sha256:` followed by the SHA-256 of the UTF-8 string `v1\0<file>\0<kind>\0<qualified_name>\0<parent-qualified-name>\0<signature>`. Use an empty final parent component for a top-level symbol. Do not include ranges or commit hash, because normal line movement must not create a new identity. |
| `repository_root` | Repository-relative root identifier. Initial indexers must emit `.`; multi-root callers may later use a normalized, slash-separated path without `.` or `..` segments. |
| `commit_hash` | Exact Git object ID for the indexed checkout, lowercase hexadecimal. It records freshness and is not part of `id`. |
| `file` | Normalized, slash-separated path relative to `repository_root`. It must not be absolute or escape the root. |
| `language` | Lowercase parser language identifier, such as `typescript`, `javascript`, `php`, `json`, or `markdown`; never a filename extension. |
| `kind` | One of `class`, `interface`, `trait`, `enum`, `function`, `method`, `constructor`, `property`, `constant`, `type`, `namespace`, `module`, `variable`, or `unknown`. Use `unknown` when a supported parser exposes a named declaration that cannot be mapped safely. |
| `name` | Declaration name exactly as represented by the parser, excluding parent qualification. Anonymous declarations do not create records. |
| `qualified_name` | Dot-separated lexical path, starting with the top-level declaration and ending in `name`; it disambiguates nested symbols. Literal dots in parser names are escaped as `\\.`. If multiple records would otherwise have the same path through unnamed syntax (for example, methods in separate object literals), append `#<N>` to the final part in source order, starting at `#2`. |
| `parent_id` | The containing symbol's `id`, or `null`. A parent must be in the same file and commit. |
| `range` | Half-open source range covering the entire declaration: `start` is inclusive and `end` is exclusive. Lines and columns are 1-based; `byte` is a 0-based UTF-8 byte offset. |
| `selection_range` | Half-open range of the declared name, contained in `range`. For declarations whose parser has no separate name span, set it equal to `range`. |
| `signature` | Single-line, whitespace-normalized declaration header, with documentation and body omitted. Preserve identifier spelling; use `""` only when the parser cannot extract a header. |

## Invariants

- Records are deterministic: re-indexing unchanged bytes with the same parser
  version produces identical records.
- A record is emitted only for a named declaration. Imports, calls, hook
  strings, metadata keys, and comments are indexed separately.
- Every range is valid for the file bytes at `commit_hash`, and
  `selection_range` is within `range`.
- An indexer must not invent a parent, signature, language, or kind when its
  parser cannot establish it. Use the permitted fallback values instead.
- Multiple declarations with the same `id` in one index run are an indexer
  error. The indexer must fail that file rather than silently overwrite a
  record.

## Compatibility and storage

The indexer may keep parser-specific data internally, but it must not expose
it through this record without a schema-version change. The future SQLite map
stores each field without loss; its table layout is deliberately deferred.
Consumers must reject an unsupported `schema_version` instead of guessing.

## Validation fixtures for the next task

The first indexer should prove this contract on:

- `src/index.ts`: module-level imports and named top-level declarations.
- `src/tools/local-explorer-task.ts`: nested functions and their parent links.
- `scripts/validate-cloud-bash.cjs`: JavaScript declarations.
- `docs/super-explorer/README.md`: no records, since Markdown is not a
  declaration language in the initial indexer.
