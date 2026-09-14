# Local thinking-budget threshold — 2026-09-14

This serial follow-up increases `num_predict` for local models that accept
`think:true`, stopping each task's sweep at its first contract-valid result or
at 4,096 tokens. It uses the same three fixtures as the prior worker replay.

The completed, usable evidence is documented in [benchmark.md](benchmark.md).
Raw requests, responses, evaluations, timings, and model/runtime identities
are preserved in [results.jsonl](results.jsonl) and the per-model environment
files. Granite 8B's sweep was stopped at the user's direction; its partial raw
rows are retained but excluded from conclusions.
