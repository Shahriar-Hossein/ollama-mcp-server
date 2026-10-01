# Field feedback

Brief observations from real tasks. These are not benchmark scores. Record
insufficient local-model results after checking them against source.

| Date | Task type | Tool / model | Gap observed | Fallback result | Possible improvement |
|---|---|---|---|---|---|
| 2026-09-27 | Repository status lookup | hybrid_retrieve / local_explore_repo / local_explorer_task, qwen3.5:4b | Index returned no candidates; tool loop read zero files and falsely reported key functions absent, with low confidence | Direct source inspection found run_paired.py and core/cycle_priority.py; Luna surveyed docs and Git history | Check indexing and tool-loop file access; surface zero-read failure before model answer |
| 2026-10-02 | Context-capacity pilot | Direct Ollama / Qwen 3.5 4B | JSON mode and an ambiguous collection prompt yielded a single evidence object | Pilot preserved; schema rerun returned three items, with remaining selection/copy errors | Specify an explicit collection wrapper and schema before measuring evidence completeness |
