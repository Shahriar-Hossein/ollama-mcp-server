# Continuous code quality reviewer

A separate CLI reviews one function per stateless Ollama request. Run batches
when convenient; SQLite retains progress between sessions. `work` drains the
eligible queue and exits. It does not watch files or run a background daemon.
MCP exposure is deferred.

Requires Node 22.13+ (built-in `node:sqlite`; verified on Node 24), installed
project dependencies, Git on PATH for ignore filtering, and Ollama for reviews.
No build or new dependency is needed. Non-Git directories also work.

## Lunch-break workflow

Run these commands from this project's directory:

```bash
npm run quality -- scan --cwd /path/to/repo
npm run quality -- review --count 10 --cwd /path/to/repo
npm run quality -- status --cwd /path/to/repo
npm run quality -- findings --severity high --cwd /path/to/repo
npm run quality -- show REVIEW_ID --cwd /path/to/repo
npm run quality -- accept REVIEW_ID --cwd /path/to/repo
npm run quality -- reject REVIEW_ID --cwd /path/to/repo
npm run quality -- rename-reports --cwd /path/to/repo
```

Other review modes:

```bash
npm run quality -- review next --cwd /path/to/repo
npm run quality -- review --file src/Foo.ts --cwd /path/to/repo
npm run quality -- review --file src/Foo.ts --count 3 --cwd /path/to/repo
npm run quality -- review --file src/Foo.ts --symbol parseConfig --cwd /path/to/repo
npm run quality -- review --file src/Foo.ts --symbol parseConfig --model qwen2.5-coder:7b --num-ctx 8192 --force --cwd /path/to/repo
npm run quality -- work --model qwen3.5:4b --cwd /path/to/repo
npm run quality -- review next --force --cwd /path/to/repo
```

`review next` always attempts one function. `--count` caps attempts, including
failures. `--file` and `--symbol` filter the queue; a file-only review defaults
to all eligible functions in that file. `--force` explicitly permits repeat reviews and exhausted retries;
it still visits each symbol at most once per invocation. `findings` returns
up to 100 historical findings by default; `--count` changes that limit.
Outdated findings are labeled. `show` renders a review from its saved snapshot.
Accept/reject only updates metadata, never source code or Git.

Run `scan` again after edits. Reviewing does not rescan the repository, but
rereads the selected file before each request. Ctrl+C/SIGTERM stops after the
current request and persistence boundary, subject to the Ollama timeout.
A hard kill preserves committed results; the unfinished request may run again.

## Model and context

The default is `qwen2.5-coder:3b`, matching `run_ollama_task`. Override it with
`--model`. The CLI loads this project's `.env`, and reuses `OLLAMA_HOST` and
`OLLAMA_TIMEOUT_MS` through `src/ollama-client.ts` (120 seconds by default).
It does not pull models. Check your installed models before choosing one. Use
`--num-ctx N` to set the Ollama context window for a run (the default is
32,768 tokens); this is useful for repeatable model comparisons.

Each request includes one target function, file/language/name/line metadata,
and up to 4,000 characters of local import/type/interface declarations.
The full function includes its signature and may include nested functions.
No sibling implementation is retrieved. Functions above 24,000 characters or
packages above 32,000 serialized characters fail visibly instead of being
silently truncated. Context is 32,768 tokens with a 4,096-token output limit.
Character limits are conservative bounds, not a tokenizer guarantee.

The prompt prioritizes correctness, performance, repeated work and error
handling over stylistic preferences. Reasonable functions should receive
`skip`. Ollama is asked for JSON-only output, not a JSON Schema grammar: this
works with models that reject Ollama's schema-to-grammar conversion. The CLI
normalizes incomplete JSON (including `findings` or `recommendations`) into its
stored review shape, preserving the raw model response for inspection. Missing
fields lower confidence or become an explicit manual-inspection issue; they do
not make an otherwise useful response disappear. Uncertain suggestions remain
suggestions for human inspection. Review quality has not been benchmarked by
these tests.

## Architecture and storage

- `src/quality-review/cli.ts`: arguments, output and stop signals.
- `service.ts`: reusable scan/status/review/findings/show/decision operations.
- `scanner.ts`: file selection, AST discovery, identity and hashing.
- `reviewer.ts`: bounded context, versioned prompt, schema and report rendering.
- `storage.ts`: SQLite transactions, process lock and safe report creation.

Only `<target>/.quality-review/` is written: `state.db`, SQLite's transient
journal, and reports named `<function>-<model>-<repeat>.md` (for example,
`runRead-qwen2.5-coder%3A7b-1.md`). The repeat number is per function and
model, in review order. `rename-reports` migrates existing report filenames
and their SQLite references. Add that directory to your ignore
rules manually if desired; the CLI never edits `.gitignore`.

Symbols retain repository, file, logical name/type, lines, hashes, timestamps,
status, retry count/reason/deadline and an active/archive flag. Reviews retain
input snapshots, raw/validated model output, model tag, prompt version,
reviewed hash, result metadata, model context window, report path, timestamp and human decision.
This preserves material for later training-data curation without adding any
training functionality. Model tags are recorded, not resolved model digests.

The validated response and queue transition commit together immediately with
SQLite `synchronous=FULL`. Markdown for every completed response, including a
clean `skip`, follows that commit. On the next review invocation, missing
report references for both findings and clean skips are recovered from SQLite
without another model call.
`show` also works when Markdown creation failed. Existing conflicting report
files cause an error instead of being overwritten.

A PID lock prevents concurrent scans/workers. Dead-process locks are reclaimed;
a live or reused PID fails closed. Use this on a local filesystem in a single
host/PID namespace. Read-only inspection can run while a model request is active.

## Discovery and queue policy

Supported: JavaScript/JSX (`.js`, `.jsx`, `.mjs`, `.cjs`) and TypeScript/TSX
(`.ts`, `.tsx`, `.mts`, `.cts`). `.d.ts` files are excluded. Named functions,
generators, methods, assigned arrow/function expressions and class-field
functions are discovered. Anonymous callbacks are not separate queue entries.

The existing tree-sitter dependencies provide names, lexical ancestry and
syntax structure directly. They avoid repeated ast-grep subprocesses and add
no dependency; the existing ast-grep tools are unchanged. Other languages,
including PHP and Python, are deliberately unsupported for now.

Identity hashes `relative-file::qualified-name`; class/function/object scopes
are included. Duplicate names use encounter-order suffixes. Line movement does
not change identity. File/symbol renames and duplicate declaration reordering
can create new identities. Hashes encode AST structure and leaf tokens, ignoring
comments and whitespace gaps while retaining literal content and syntax changes
such as automatic semicolon insertion. Semicolon/quote-style rewrites can still
change hashes. Changes inside nested functions also change their containing
function's hash.

Scans commit atomically. A parse error or file above 2 MB aborts the scan without
archiving old entries. Built-in exclusions cover Git metadata, dependencies,
build output, coverage, caches and `.quality-review`; Git ignore rules are used
where available. Symlinks are skipped. Arbitrary include/exclude configuration
and additional language adapters are future extensions.

Queue order is deterministic: pending, stale, then eligible failures; within
those groups, file/name/ID. `--file` overrides selection, and `--force` includes
reviewed functions before retries. New symbols are pending, deleted symbols
are archived, and changed reviewed symbols are stale. Unchanged reviewed
symbols remain reviewed. Returning to a previously reviewed hash reuses its
history, without a fresh request. Surrounding-context-only edits do not requeue
an unchanged function; use `--force` when needed.

Failures retry after at least 60 seconds, with a maximum of three attempts per
version. Malformed output permits the batch to continue. Transport/service
failures stop the batch after recording the current failure, avoiding thousands
of failed entries when Ollama is unavailable. An empty/delayed queue exits;
restart later for retries. A changed hash resets retries.

## Security and limits

Source is read-only. The model has no tools, shell, filesystem access, path
selection or scheduling authority. SQL uses bound values, reports use generated
IDs, source paths reject traversal/symlinks, and storage/report paths reject
preexisting symlinks and unsafe hard links. Git is invoked only as read-only
`check-ignore` with explicit argv. No target code, config, scripts or hooks run.

Source text and model reports remain untrusted content; reports can contain
model-authored Markdown. No patch application or automatic execution exists.
Filesystem checks do not provide isolation from a malicious local process racing
to replace directories while the CLI is running. This is not an OS sandbox.

No MCP tools, UI, daemon, automatic rescanning, source editing, cloud queue,
training pipeline, custom scheduling or general-purpose plugin system is added.

## Verification

```bash
npm run test:quality
npx tsc --noEmit
```

Focused tests use temporary repositories and an HTTP mock at the existing Ollama
boundary. They verify AST hashing/scopes, language extensions, one/three separate
requests, persistence across CLI processes, per-symbol changes/additions/deletions,
historical-hash reuse, unchanged source bytes, storage-only writes, bounded
failures, atomic scan rollback, locks, path/link rejection, report recovery and
Ctrl+C followed by restart with remaining work. No live-model quality claim is
made. The HTTP mock needs permission to bind a localhost port.
