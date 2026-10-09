# Configuration scout continuation

Continues [default-instance context](2026-10-09-h-config-instances.md).
Branch `main`, baseline `92b6454`. The previous session exhausted its context
window during delegated discovery/review. The user confirmed that no total task
token budget was requested. At handoff, no implementation changes or fresh H
generation had completed. Prior frozen evidence remains unchanged.

## Verified progress

Two fresh Luna source searches found a direct imported `jwtConstants.secret`
property use in `nest-auth-api/src/auth/constants.ts:2` and
`src/auth/auth.module.ts:6`. No fresh supported default-import local-instance
positive was found in the bounded search. The whole imported `jwtConfig` object
from Codesyard is unsupported by the current provenance check; do not label it
a supported positive. Earlier database/order and storage-driver cases stay
excluded from a new screen. External source repositories remain read-only.

Sol reproduced accepted helper contexts for:

- Destructured consumer bindings shadowing the default import.
- Static/accessor declarations treated as callable instance readers.
- Constructor reassignment and overwritten reader members.
- Ordinary returned `provide` properties suppressed as metadata tokens.

These reproductions use tree-sitter and a minimal reference/dependency index.
They establish helper-contract gaps, not real-index completeness or a final false
`supported` result. Instance semantics still require parent review.

Detailed findings, acceptance cases and reproduction files are preserved under
ignored `benchmark-data/supervisor-2026-10-09/`. Working scratchpad:
`/tmp/ollama-supervisor-2026-10-09/`. The original reproduction fixture root is
recorded in `instance-review-repro.json`.

## Original next step

Assign a fresh Sol engineer the review file and narrowly fix instance binding
invalidation and reader-method eligibility, with real-index configuration
regressions. Have Luna handle isolated mechanical work through scratch request
files. Separately verify the metadata-filter finding and choose the smallest
recognized metadata scope. Preserve `needs_review`, six-file/character/two-call
limits and frozen evidence. Run targeted tests and required project checks.

Then review the proposed two-file Nest source screen, freeze exact questions and
rubrics before generation, and record the missing instance-positive limitation.
Use one detached `setsid nohup flock -n` H supervisor; score supplied and selected
rubric lines separately from parent completion. Never launch concurrent local
models. No commits or publication were requested.

## Continuation

The user authorized delegated fixes and a commit from each agent for completed
tasks. Instance bindings are fixed in `11fd4eb`; metadata scope is fixed in
`e396f13`. Real-index regressions and stubbed end-to-end checks preserve
`needs_review`; all 90 integrated scout tests pass.

The proposed nest-auth-api property case already appeared in the frozen
provenance screen and was rejected as fresh evidence. A bounded local search
found no suitable fresh production pair. The new screen uses the pinned official
NestJS JWT example, with domain/symbol overlap and the missing real-source
instance positive recorded explicitly. See [the binding screen](2026-10-09-h-binding-screen.md)
for the frozen questions, run status and next actionable step.
The follow-up [fresh real-app evaluation](2026-10-09-h-fresh-eval.md) used the
user's sharks-capital and infivro-loyalty-rewards projects and added
generic `supporting_context` rules; it is the current next step.

Agents must not spawn other agents or run local models independently. Announce
each spawn, use fresh contexts and concise file handoffs. Local Ollama requires
the approved network escalation from this sandbox; model listing via MCP works.
