# Super Explorer Git history lookups

The history CLI exposes source-backed Git evidence without invoking a shell:

```text
npm run --silent git-history:super-explorer -- <operation> <repository-root> <file-or-symbol-id> [limit]
```

Operations are `file-introduction`, `symbol-introduction`,
`file-recent-changes`, `symbol-recent-changes`, and `blame-symbol`. Recent
change operations accept an optional integer limit from 1 through 100.

File operations accept only tracked, repository-relative paths and use `git
log --follow`, so a renamed file's history is included. Symbol operations
accept a stable symbol ID from the current index. They use Git line history
and blame over the symbol's current half-open source range. This is precise
for source lines Git can trace, but a moved or substantially rewritten symbol
can have an incomplete history; the result is history evidence, not proof of
semantic equivalence across revisions.

Every response records the indexed `commit_hash`. Commit records include the
commit hash, subject, author timestamp, and changed paths, including both
paths for detected renames. Blame output maps each current symbol line to its
attributed commit and commit metadata.
