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
| 2026-10-05 | Held-out cross-file and negative evidence | local_explore_repo / qwen-context:h-q4_0-50k | Both positive cases miss required evidence; negative cases cite nearby source despite explicit unresolved requirements | Independent source review separated retrieval and selection gaps; regression requires needs_review for unresolved output | Improve generic cross-file packing and evidence relevance; freeze new unseen questions before tuning |
| 2026-10-06 | Natural cross-file behavior evidence | local_explore_repo CLI / qwen-context:h-q4_0-50k | Three independent source-slice positives omit required lines; two still pass status, and one safe negative retains another caller's citation | Parent source comparison separates missing windows, incomplete selection and safe status; no tuning or rerun on the screen | Decompose semantic parts, preserve large-method windows and require review for unchecked completeness |
| 2026-10-06 | Multi-step source selection | local_explore_repo CLI / qwen-context:h-q4_0-50k | Fresh screens remain incomplete; repeated clauses caused overflow and one provider was not packed | Source review fixed duplicate parts and scoped window budgets; final regression passes, follow-up safely requires review | Rank provider files by requested operations and check input conditions/branches explicitly |
| 2026-10-06 | Mechanical git commit | run_local_worker_task / local worker (model not reported) | Gave up after eight turns without a final answer or git changes | Direct bounded Git workflow staged and committed the explicit paths | Improve worker completion handling for multi-path stage-and-commit tasks |
| 2026-10-06 | Provider and condition evidence | local_explore_repo CLI / qwen-context:h-q4_0-50k | Provider discovery supplies all development requirements, but selection still omits an optional-file guard and method identity lines | Parent source comparison separates complete packing from partial selection; review status is retained | Bind condition and branch citations to the requested operation owner; validate new questions before promotion |
| 2026-10-06 | Named image-operation evidence | local_explore_repo CLI / qwen-context:h-q4_0-50k | Absent-file selection omits the guarded upload assignment despite 15/15 supplied lines and satisfied heuristic checks | Parent source comparison identifies the missing line; deletion and cleanup meet their minimum reused rubrics and retain review | Select the guard and guarded assignment together; validate structurally different frozen questions |
| 2026-10-06 | PHP repository lookup | outline_file / local_explore_repo, qwen-context:h-q4_0-50k | PHP outline is empty; scout packs unrelated JavaScript and returns no evidence with needs_review | Direct inspection finds search sanitization, allowed sorts and activity query in Customers.php | Report unsupported file languages explicitly; fall back to bounded text reads before generation |
| 2026-10-06 | Release documentation lookup | hybrid_retrieve, basic | Natural release question returns unrelated JavaScript; explicit release paths return no results; adding documentation finds the guide but only its heading excerpt | Source inspection confirms build command and ZIP exclusions; retrieval source gates documentation on a narrow vocabulary | Include path and build/release intent in documentation routing; return relevant answer windows |
| 2026-10-06 | Worker flags and registrations | local_explore_repo / qwen-context:h-q4_0-50k | Flag mappings selected, but registration guards/calls and autonomousFlag body absent; src/index.ts is not packed; safely returns needs_review | Source review establishes independent 1/0 flags and both guarded registrations | Follow configuration consumers across imports; keep flag mapping, resolver and registration evidence together |
| 2026-10-06 | Absent Redis outline cache | local_explore_repo / qwen-context:h-q4_0-50k | Safely reports unresolved Redis requirements but retains thirteen unrelated image-operation checklist citations | Bounded search finds no Redis references in src or package.json; selected citations do not establish the requested implementation | Drop irrelevant citations on abstention; avoid keyword-overlap evidence from the scout's own heuristics |
| 2026-10-06 | Release search via tool loop | local_explorer_task / qwen-context:h-q4_0-50k | Reads both correct files, then confidently invents an rsync Markdown exclusion and misattributes .gitkeep to documentation | Script line 35 excludes Markdown through zip; rsync exclusions at lines 26/29 concern .gitkeep/temp | Check claimed commands against executable lines; high confidence alone cannot validate an answer |
| 2026-10-06 | Small JSON extraction | run_ollama_task / qwen-context:h-q4_0-50k | All extracted values correct, but requested object is wrapped in a one-element array | Direct line count confirms sixteen entries, five hidden entries and the exact Markdown pattern; JSON shape needs correction | Request and validate an explicit object schema |
| 2026-10-06 | Five-file source summary | summarize_output / qwen-context:h-q4_0-50k | With 28,300 input characters, confuses table headings with CSS grid columns, invents rsync Markdown filtering and cites the wrong ZIP-path lines | Source review confirms grid declaration at CSS line 320, zip filter at script line 35 and output path at line 15 | Validate behavior and citation locations separately; distinguish CSS layout from table columns |
| 2026-10-06 | Scout parameter discoverability | local_explore_repo, MCP validation | limit=6 rejected; exposed description does not state the valid 8–12 range | limit=8 accepted; source schema confirms the range | Include range and default in the exposed parameter description |
| 2026-10-07 | Re-run of plugin/server smoke checks | local_explore_repo, run_ollama_task, summarize_output / qwen-context:h-q4_0-24k | PHP and shape fixes hold; scout still keeps unrelated citations on full abstention; JSON count off by two; summary still confuses table headers with grid columns | Direct source reads confirm each gap | Drop citations when every part is missing; validate counts outside the model |
| 2026-10-09 | Flag helper and consumer packing | local_explore_repo / qwen-context:h-q4_0-24k | Both live development probes pack 9/9 required lines but select 6/9, omitting the resolver branches/error; return needs_review | Source comparison verifies mappings, independent 1/0 resolver and both guard/call pairs; 49 scout regressions pass | Freeze different configuration questions before tuning helper-line selection |
| 2026-10-09 | Frozen storage-driver configuration | local_explore_repo / qwen-context:h-q4_0-24k | After resolver shortlists fix the worker development rubric to 9/9, the different positive supplies 15/16 and selects 9/16; the negative selects 7/7 and requires review | Source comparison confirms missing global ConfigModule packing and omitted startup/default/provider lines; 53 scout regressions pass | Use separate development cases for generic configuration APIs, then freeze fresh validation; do not tune this screen |
| 2026-10-09 | Synthetic configuration quote audit | local_explore_repo / qwen-context:h-q4_0-24k | Positive logs 9/9 supplied/selected; negative audit aborts on a variable excerpt missing const, before output persistence | Full-line symbol packing regression fixes the source invariant; no model rerun or final-revision accuracy claim | Persist answers before audits; freeze fresh initialization/provider cases |
| 2026-10-09 | Fresh configuration initialization/provenance scouting | local_explore_repo / qwen-context:h-q4_0-24k | Low-confidence output retained unrelated test/setup citations and missed the configuration/auth source chain | Bounded Luna search and lead source inspection found initialization, constructor injection and a separate environment-backed signing constant | Anchor initialization declarations and injection context; keep runtime provenance under parent review |
| 2026-10-09 | Frozen initialization/provider provenance | local_explore_repo / qwen-context:h-q4_0-24k | Initialization supplies/selects 5/5; provenance supplies 8/8 but selects 5/8 and retains an unused import; negative supplies/selects 5/5 with nearby constructor context | Separate parent source review completes the bounded questions; all audits pass and all cases require review | Develop imported constant/property provenance and named-owner cases separately, then freeze different questions |
| 2026-10-09 | Frozen loader/order and default-instance boundary | local_explore_repo CLI / qwen-context:h-q4_0-24k | Both questions supply 9/9 lines but select 7/9 and 8/9; unrelated module/provider tokens add unresolved constant requirements | Separate parent source review completes bounded declarations; runtime timing remains unestablished, both audits pass and both cases require review | Distinguish configuration values from module tokens; develop default-import instance context separately, then freeze fresh questions |

## 2026-10-06 mixed MCP smoke checks

Fifteen ad hoc cases plus one invalid-parameter probe, using the loyalty plugin
and MCP server repositories. These are exploratory observations, not a benchmark
score or held-out evaluation. Queries were chosen during the session; S8/S9 are
follow-ups to S1. No implementation changes or tuning were made.

Source revisions: plugin `3f9d7ec4056ca6199b73d6d07cb389d766cf8b5b`;
server `cc6ec8a1bfaa5a28a3c5aa4fd063a3e524c4bf4c`. Both working trees
were clean before the checks and before this feedback update.

All generation calls explicitly used `qwen-context:h-q4_0-50k`; context inherited
the saved 50,000 setting. Scouts used `limit=8` and `num_predict=2048`.
The legacy loop used five tool calls maximum, three files maximum, 3,500 characters
per result, `num_predict=1024`, `think=false` and a 30-second per-request
deadline. Its actual result reported two reads/tool calls. Extraction used
`num_predict=512`; summary used `num_predict=2048`; both had a 120-second
deadline. Retrieval used `mode=basic`, `limit=5`.

Times below are client wall times, including MCP overhead. S1–S4 and S6–S8
were concurrent batches; generation calls were sequential. These measurements
do not isolate model inference, queueing or cold-load costs.

| Case | Request / tool | Time (s) | Checked result |
|---|---|---:|---|
| S1 | Natural release ZIP/exclusions question / hybrid_retrieve | 1.9 | Five unrelated customer-rewards JavaScript symbols; build guide absent |
| S2 | Customers.php / outline_file | 3.5 | Empty symbols despite render/activity_label methods; indexer only supports JS/TS extensions |
| S3 | parseAllowedGitCommand / find_symbol | 7.4 | Exact function plus partial nested-variable match; correct file and lines |
| S4 | Worker flags and experimental master flag / hybrid_retrieve | 11.6 | Relevant feature mappings/resolver context among results; retrieval alone is not a complete answer |
| S5 | shell-allowlist.ts / outline_file | 4.2 | Nine top-level declarations; correct function ID and range |
| S6 | parseAllowedGitCommand ID from S5 / read_symbol | 4.8 | Correct function source and bounds at lines 28–34 |
| S7 | Same function ID / find_callers | 10.8 | Two statically resolved call sites; both verified by source search |
| S8 | Explicit release guide/script/.distignore paths / hybrid_retrieve | 7.1 | No results although all three paths are tracked |
| S9 | documentation build release ZIP Markdown excluded / hybrid_retrieve | 1.7 | Guide first, but only heading excerpt; documentation routing requires a trigger term |
| L1 | local_explore_repo with limit=6 | 2.0 | Validation error; no generation; retried once with valid limit |
| L1b | Worker flags plus configuration/registration evidence / local_explore_repo | 95.0 | Two model calls; partial mappings selected, one rejected reference, low confidence and needs_review |
| L2 | PHP search/sort sanitization and last-six activity query / local_explore_repo | 32.7 | Two model calls; unrelated JS packed; zero selected evidence, low confidence and needs_review |
| L3 | Redis TTL/invalidation for symbol outlines / local_explore_repo | 68.5 | Two model calls; low confidence and needs_review, but thirteen irrelevant checklist lines retained |
| L4 | Read release guide/script; command, ZIP name, metadata, Markdown / local_explorer_task | 18.1 | Correct files read and most facts found; high-confidence false rsync claim |
| M1 | Count/classify .distignore entries into a JSON object / run_ollama_task | 5.3 | Sixteen entries, exact pattern and five hidden entries correct; returned array instead of object |
| M2 | Seven requested facts from five numbered source files / summarize_output | 79.2 | Search/sort/pagination/activity facts correct; CSS layout and Markdown implementation wrong; ZIP-path citation misplaced |

Verification used bounded direct reads and source searches. For the worker flags,
`src/config/features.ts:23` defines the independent 1/0 resolver,
lines 41/42 map each flag, and `src/index.ts:61` / `:65` guard the
registration calls at lines 63/67. L1b did not pack `src/index.ts`.

For the plugin, `src/Admin/Customers.php:23` / `:25` sanitize inputs,
line 26 restricts sort values, lines 29/31/33 set directions, lines 42/43
set page size/clamping, and line 74 orders activity by transaction ID with
`LIMIT 6`. `assets/css/admin-pages.css:320` defines two grid columns;
lines 474–476 collapse them at 1050px. `scripts/build-release.sh:15`
sets the default output; line 35 applies the case-insensitive Markdown
pattern through `zip -x`. The script does not read `.distignore`.

Useful follow-up: test documentation routing, unsupported-language reporting and
executable-line validation on new questions. Keep these failures as observations;
do not count safe abstention or correct-file retrieval as a complete answer.

Follow-up 2026-10-07: M1 → `run_ollama_task`/`summarize_output` now take `format`
(JSON Schema); a live H check returned the required object shape. L2 → named
unindexed languages return `no_evidence` before generation. L3 → operation
checklists require an image-upload or query/list anchor term. Not re-run on
the original plugin questions.

Re-run 2026-10-07, same plugin revision, default `qwen-context:h-q4_0-24k`
called directly (not via MCP). Query wording was reconstructed, so these are
not exact repeats.

| Case | Time (s) | Checked result |
|---|---:|---|
| L2 | 0.1 | Fixed: `no_evidence`, zero model calls, names PHP; unrelated JS is still returned in `bundles` |
| L3 | 66 | Checklist noise gone; H still keeps 12 unrelated `read-symbol.ts` lines while marking every part missing (`needs_review`) |
| M1 | 2.6 | Object shape correct; hidden entries and pattern correct; count wrong (14, not 16) |
| M2 | 68 | 6/7 correct; rsync claim and ZIP-path citation fixed; still calls the 5 table headers the grid columns (CSS line 320 has 2) |

Decided 2026-10-08: keep nearby citations when a part is missing. Only full
abstention drops evidence; two tests assert this. Schema fixes shape, not counts.
