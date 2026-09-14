# Thinking-enabled worker benchmark — 2026-09-14

This is a serial, like-for-like replay of the bounded three-task local worker
fixture with `think:true`. It compares directly with the 32K, `think:false`
replay in [../worker-review-rerun-2026-09-14/](../worker-review-rerun-2026-09-14/).

Read [benchmark.md](benchmark.md) for the conclusion. Raw requests and
responses are in [results.jsonl](results.jsonl); model identities and the
protocol are in [environment.json](environment.json). No models were added or
removed. Every supported model was unloaded after its three calls; the final
`ollama ps` was empty.
