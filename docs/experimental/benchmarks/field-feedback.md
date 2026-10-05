# Field feedback

Brief observations from real tasks. These are not benchmark scores. Record
insufficient local-model results after checking them against source.

| Date | Task type | Tool / model | Gap observed | Fallback result | Possible improvement |
|---|---|---|---|---|---|
| 2026-09-27 | Repository status lookup | hybrid_retrieve / local_explore_repo / local_explorer_task, qwen3.5:4b | Index returned no candidates; tool loop read zero files and falsely reported key functions absent, with low confidence | Direct source inspection found run_paired.py and core/cycle_priority.py; Luna surveyed docs and Git history | Check indexing and tool-loop file access; surface zero-read failure before model answer |
| 2026-10-02 | Context-capacity pilot | Direct Ollama / Qwen 3.5 4B | JSON mode and an ambiguous collection prompt yielded a single evidence object | Pilot preserved; schema rerun returned three items, with remaining selection/copy errors | Specify an explicit collection wrapper and schema before measuring evidence completeness |
| 2026-10-02 | Multi-part repository evidence | local_explore_repo / qwen-context:h-q4_0-50k | Final source bundles contain all requirements, but selections still omit tool guards and lock rejection/caller; retries can drop supported parts | Source review isolated selection failures; fixtures verify supported-part retention and complete packing | Keep supported parts across retries; improve selection of remaining chain elements |
| 2026-10-03 | Concise evidence under large input | Direct Ollama / qwen-context:i-q8_0-32k, verified q8 KV | Wrong embedding evidence and copy errors persist with 256–1024 output ceilings; near-30k inputs also miss required lines | Exact source comparison separates selection/copy failures from natural stops and GPU fit | Improve source selection; do not treat larger context or output reserves as quality fixes |
| 2026-10-05 | H-only evidence selection | local_explore_repo / qwen-context:h-q4_0-64k | Stronger wording alone selected complete evidence in 3/12 cases; shortlists still dropped partial citations and an unrelated throw passed the lock heuristic | Source review tightened rejection checks; retaining checked partial citations returned complete evidence in 12/12 development cases | Test held-out questions and irrelevant citations; do not generalize fixture results |
