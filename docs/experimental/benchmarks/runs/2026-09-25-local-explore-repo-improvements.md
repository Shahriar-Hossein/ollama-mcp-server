# Local explore repo context and citation changes — 2026-09-25

This is an experimental route change. The historical 2026-09-24 smoke results
remain the baseline; its four questions are reused here only as a regression
check, not as a reliability estimate.

## Route changes

- Split explicit compound questions into evidence parts and retrieve for each.
- Add exact source matches, query aliases for concurrency/flags, symbol matches,
  and relevant configuration windows before packing the model context.
- Pack up to six small source bundles with file, symbol, line, relationship, and
  retrieval reason. Collapse repeated bundles in the prompt and include a short
  file/symbol map.
- Give each displayed source line an `E` reference. The local model selects up
  to three references per question part. The server checks each reference and
  copies the exact source text into the returned citation. Simple source checks
  require direct lines for registration, defaults, tool gates, settings, and
  lock behavior before reporting a part as covered.
- Permit one bounded expansion around a displayed source line if the model
  reports a missing part. The parent still interprets behavior; part coverage
  is model-indicated, not semantic claim verification.

The prior lock miss was a retrieval failure: `Store.lock()` and `worker_lock`
were absent from the model context. The revised deterministic context includes
both `src/quality-review/storage.ts` and the call in `service.ts`. The embedding
and autonomous-tool questions also now include their implementation and flag
mapping lines respectively. These are context-coverage checks, not model scores.

## Verification

`npm run test:local-explore` exercises quote checking, line-reference selection,
question splitting, the lock context, and bounded expansion. The repository-wide
`npx tsc --noEmit` remains blocked by `src/experimental/explorer/explore.test.ts`
importing `vitest`, which is absent from `package.json`; TypeScript reported no
errors in the changed files.

## Live smoke result

Final run: `qwen3.5:4b` (`2a654d98e6fb`), `think=false`, basic retrieval,
limit 10 per part, 16K context, 2K output, one retry/expansion at most. HEAD was
`019bf5e686e0d806625a4176d4fc8eb03835a958` with the route changes
uncommitted. The four questions are the 2026-09-24 fixture. Raw structured
output is in the ignored artifact
`benchmark-data/local-explore-repo-improvements-2026-09-25/qwen-final.json`.
Total elapsed was 60.8s.

| Question | Context contains required source? | Final status | Manual grade of selected evidence |
| --- | --- | --- | --- |
| SE-01: registration/default | Yes | `evidence_selected` | Useful: registration call, guard, flag mapping, and false master default. |
| SE-02: autonomous gates | Yes | `needs_review` | Partial: both variable names and one guarded registration; cloud tool mapping omitted. |
| EMBED-01: embedding `keep_alive` | Yes | `evidence_selected` | Useful: actual `keep_alive: "0"` field and GPU-memory reason. |
| QR-LOCK-01: duplicate workers | Yes | `needs_review` | Partial: lock method and caller, but the rejection/insert logic was not selected. |

This is **4/4 source coverage**, **2 useful / 2 partial model selections**, and
**2/4 accepted final statuses** on this small, reused fixture. The old route's
Qwen result was 2 useful / 1 partial / 1 miss, with 4/4 citation validation,
but the runs used different working trees and repeated development questions.
These figures do not establish a reliability improvement. The concrete gain is
that the previously absent lock source now reaches the model; the remaining
failures are selection failures. Keep parent review/fallback for `needs_review`
and inspect source even for `evidence_selected`.
