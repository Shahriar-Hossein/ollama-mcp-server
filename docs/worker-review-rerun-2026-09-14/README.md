# Local worker benchmark rerun — 2026-09-14

This is a fresh, serial replay of the bounded three-task benchmark in
[`../worker-review-2026-09-14/`](../worker-review-2026-09-14/). It preserves
the older evidence and adds results for the currently installed local models.

Read [benchmark.md](benchmark.md) for findings. Raw requests and responses are
in [results.jsonl](results.jsonl); the executable code grades are in
[grades.json](grades.json); tag digests, prompts, and runtime snapshots are in
[environment.json](environment.json). Phi's later replay is captured in
[phi4-mini-run-2026-09-14.json](phi4-mini-run-2026-09-14.json).

The report also contains a 16K-context follow-up for `qwen2.5-coder:7b` and
`granite4.2:8b`.

`phi4-mini:3.8b` was installed after the initial replay and then run with the
same three fixtures at 32K. No models were downloaded or removed during its
run.
