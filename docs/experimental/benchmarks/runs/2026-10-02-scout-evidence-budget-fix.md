# Scout evidence and model budgets — 2026-10-02

The final H run returns complete evidence on 2/4 questions. All required
source is present in every bundle; the remaining failures are selection.
H/I settings now propagate through local MCP routes. I's default output
reserve makes the current conservative input check reject these bundles.
This is an implementation check, not an H/I quality comparison.

## Diagnosis and changes

The saved phase-2 q4 run already contained the default helper and exclusive
locking transaction. Qwen omitted them. Its cloud registration was absent
from the packed bundle. Three references per part were also insufficient
for a lock chain or two guarded registrations.

- Collect up to three source windows per matching file and merge same-file
  windows before packing. Deduplicate shared bundles and charge source once.
- Allow six references per part. State default-helper and transaction
  requirements explicitly. Check each part's own citations.
- Require a registration guard and the transaction/rejection/caller chain.
  These checks are heuristics; parent source review remains necessary.
- Retain supported parts across a retry. A real intermediate run dropped
  previously correct environment mappings while fixing registrations.
- Report packing/input overflow explicitly before model generation.

Prompt/schema and coverage helpers live in separate small modules. The
expanded tool exceeded tree-sitter's default input buffer and failed local
indexing; splitting the file restored the fixture checks.

## Model settings

The selected model's saved parameters are read through Ollama's
[`/api/show`](https://docs.ollama.com/api-reference/show-model-details).
Request overrides are optional and explicit. H is the operational default
on the system q4 daemon; this does not establish a quality winner.

| Model | Context | Output ceiling | Input reserve after 1024 margin |
|---|---:|---:|---:|
| H | 50000 | 25000 | 23976 |
| I | 32768 | 25000 | 6744 |

Delegation, summaries, both scouts and advanced discovery/verification honor
saved settings. The shared `generate()` still returns text. Quality Review
keeps its separate explicit CLI budget contract. Missing saved limits use
reported 16384/8192 fallbacks; unbounded saved output needs a finite override.

The input check bounds UTF-8 bytes including system, question/source/history,
schema and template. It can reject feasible tokenized requests. Raw smoke
requests, effective options and `prompt_eval_count` are preserved so this
bound can later be tightened without hiding truncation.

## Final evidence review

H v3 uses 50000/25000, thinking off and inherited sampling. Requests remain
concise; the ceiling is not a target output length.

| Case | Required source present | Returned evidence | Status |
|---|---|---|---|
| SE-01 | All | Registration guard/call, flag mapping, helper and false master default | Complete |
| SE-02 | All | Environment mappings and tool calls; omits both relevant guards | Needs review |
| EMBED-01 | All | Assignment and GPU-contention reason | Complete |
| QR-LOCK-01 | All | Transaction/BEGIN/insertion; omits rejection and lock caller | Needs review |

The first two H artifacts are intermediate implementations, not repetitions
of v3. H v1 returned two source-complete cases but also accepted an incomplete
registration answer. V2 tightened checks and exposed a retry that dropped
environment mappings. V3 includes supported-part retention. Do not pool them.
Timings depend on cache reuse and changed source/prompts; blocks were not
rotated. No latency, parent-work savings or routing claim follows.

I was loaded on an isolated q8 daemon: 32768 context, q8 K/V buffers, 34/34
GPU layers, Flash Attention and one slot. A short request using 32768/25000
completed. All four scout requests returned `input_overflow` before model
calls. These are conservative budget refusals, not accuracy failures, and
do not demonstrate sustained 25000-token output. Temporary resources were
removed and H restored on the unchanged system q4 daemon.

## Evidence and checks

- Ignored artifacts: `benchmark-data/qwen-context/evidence-budget-fix/`.
  `smoke-H-v3.json` is the final model run; `evidence-audit.json` records
  source presence and missing selected elements. Earlier H runs stay separate.
  Requests/options/metrics are in each smoke artifact; q8 runner settings and
  restored H placement are saved separately.
- One detached `setsid nohup flock -n` supervisor ran at a time. Completion
  artifacts and lock release were checked before changing models.
- Pass: 12 scout fixtures, 7 budget tests, 3 feature tests, 8 Quality Review
  tests, whitespace checks and TypeScript excluding the pre-existing test
  importing missing `vitest`. Standard TypeScript still reports that dependency.

Next: improve selection of the tool guards and lock rejection/caller, and
calibrate or compact input accounting so I can accept feasible requests with
its saved ceiling. Capture representative caller overhead and measure parent
follow-up work before making broader quality or savings claims.
