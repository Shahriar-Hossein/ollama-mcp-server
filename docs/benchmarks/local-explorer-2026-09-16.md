# Local-explorer pilot: does a local worker absorb repo discovery? (2026-09-16)

Different question from every other file in this directory: not "is a
model's output correct" but "can a local model, given only Glob/Grep/Read,
find the right file/function in *this* repo cheaply enough to be worth
inserting ahead of Haiku/Sonnet in the tool-call path." Motivated by a
proposed local-explorer → Haiku → Sonnet routing tier.

## Method

Built a throwaway harness (scratchpad-only at the time) that gives a model
three tool-calling functions — `glob`, `grep`, `read` — each backed by real
`find`/`grep`/`fs.readFile`, capped at 8 tool calls and 5 files read per
task, 3000-char tool-output truncation. System prompt demands a
`FINAL ANSWER:` block with files, symbols, cited evidence, and a
self-reported confidence — same "final-report reminder" pattern
BENCHMARKS.md's T1 result already found load-bearing for `qwen3.5:4b`.

**Promoted to `src/tools/local-explorer-task.ts`** as the `local_explorer_task`
MCP tool, registered unconditionally in `src/index.ts` (read-only, so it
doesn't need the shell-executing tools' opt-in gate). Same budget/prompt
design as the pilot harness, plus a repo-root escape check on every
model-supplied path before it touches disk.

Five real exploration questions about this repo's own source (allowlist
validation, default model/timeout, the cloud-bash validator hook wiring,
the local-worker turn loop, tool registration), ground-truthed by hand via
direct `grep`/`read` before running any model. Compared:

- `qwen3.5:4b` — the only model earlier T1/G1 screens confirmed emits real
  `tool_calls` in this harness shape.
- `qwen2.5-coder:7b` — the model actually suggested for this tier; run once
  as a sanity check given T1 already flagged it as failing tool-use.
- `granite4.2:3b` — run once, as a candidate "simpler tasks" cheap model.
- A Haiku-model `Explore` subagent (real Glob/Grep/Read, not the toy
  harness) on the identical five questions, as the tier this is meant to
  offload work *from*.

## Results

| Model | Correct | Tool calls (total/5 tasks) | Wall time (total) | Notes |
|---|---|---|---|---|
| `qwen3.5:4b` | 4/5 | 27 | 88.4s | 1 hallucination, self-flagged low confidence |
| `qwen2.5-coder:7b` | 0/1 tested | 0 (no real tool_calls) | 15.9s | disqualified, see below |
| `granite4.2:3b` | 1/1 tested | 9 (full budget) | 30.7s | correct but inefficient path-finding |
| Haiku (`Explore` subagent) | 5/5 | 9 | 26.9s | all "very high" confidence |

### `qwen3.5:4b` — the only viable local candidate, and it mostly worked
4/5 correct with accurate file:line citations, including two efficient
runs (2 and 4 tool calls) that nailed the answer immediately. The one
failure (task 3: find the script that validates `run_cloud_claude_task`'s
bash calls, and how it's wired in) burned its entire 9-call budget guessing
`snake_case`/generic glob patterns (`**/bash_tool_validator*`,
`**/*hook*`) instead of ever grepping for a plausible real term, then
fabricated a `--tool-validator` CLI flag and `validate_bash_tool` symbol
that don't exist — but correctly self-labeled `Confidence: low`. That
matters: in the proposed router (uncertain local result → escalate to
Haiku), this exact case would have been escalated rather than trusted.
This run is a small but real point in favor of the design, not just the
model.

### `qwen2.5-coder:7b` — confirms the existing docs, disqualifying
Matches [model-classification.md](../model-classification.md)'s existing
note almost exactly: it doesn't emit real `tool_calls` in this harness at
all — it dumped pseudo-tool-call JSON as plain text, then answered from
pure invention: `src/security.py`, `src/parser.py`, `validate_allowlist()`
— fabricated Python files in a 100% TypeScript repo — labeled
**`Confidence: high`**. Not a close call: this model is unusable for this
tier regardless of speed, and the danger is specifically that its
confidence label is worthless, unlike `qwen3.5:4b`'s which tracked
correctness in the one test case available.

### `granite4.2:3b` — correct once, but wasteful
Got the right answer but spent its full 9-call budget on wrong glob
guesses (`**/*mcp*.ts`, `**/mcp/**/*.ts`) before falling back to a bare
`**/*.ts` scan that actually worked. Same failure shape as `qwen3.5:4b`'s
miss above (guessing paths instead of grepping content first) but here it
recovered before running out of budget. Only one task tested — not enough
to route on, but not an immediate disqualification either.

### Haiku baseline — beat the local worker on every axis measured
5/5 correct, "very high" confidence throughout, using *fewer* total tool
calls (9 vs `qwen3.5:4b`'s 27) and less wall-clock time (26.9s vs 88.4s)
across the same five questions. This is the central finding: on a repo
this size, with these task shapes, Haiku is not just more accurate than
the local tier — it's also faster and more tool-call-efficient. The
proposed workflow's value is not "the local worker is better or even as
good," it's purely "the local worker's tool calls don't cost Claude-side
quota" — and that framing only pays off if the accuracy gap is tolerable
and reliably self-flagged.

## What this means for the routing idea

- **The concept is sound, but only with the confidence-gate step.**
  `qwen3.5:4b`'s one wrong answer was also its one low-confidence answer.
  If the router trusts high-confidence local answers and escalates
  low-confidence ones to Haiku, this run's numbers say that gate would
  have worked. Skipping the gate (trusting every local answer as-is) would
  have shipped one fabricated answer straight to Sonnet.
- **`qwen2.5-coder:7b` should not be used for this tier at all** — it fails
  silently and confidently, not just occasionally. This overrides the
  original suggestion to start with it; start with `qwen3.5:4b` instead,
  consistent with the T1/G1 rows already in
  [BENCHMARKS.md](../BENCHMARKS.md).
- **Sample size is the real caveat.** Five tasks, one repo, one run each —
  this is a screen, not a reliability estimate (see BENCHMARKS.md's
  evidence-strength framing). Before adopting this as a default routing
  tier, repeat on the ~20-task scale the original proposal called for, and
  specifically stress the failure mode seen here (symbol/path guessing
  before grepping) since it's the one that produced a confident-sounding
  wrong answer.
- **Net recommendation: not yet worth wiring in as a default tier.** On a
  repo this small, Haiku's own Glob/Grep/Read usage is already cheap (9
  tool calls, <30s) — the local tier's savings would only show up on much
  larger repos/tasks where Haiku's own exploration cost is the thing being
  optimized away, which this pilot didn't test.
