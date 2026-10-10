# 2026-10-10 qwen9b vs 4b: test prompts

Prompts and gold/rubric as sent in the 2026-10-10 run.

| Test | Checks | Source | Status |
|---|---|---|---|
| T1 (`T1-question.md`) | Worker flags, resolver, registrations (9 gold lines) | Session 97de858e, `tests/T1.md` + harness query | Query verbatim; gold/rubric from the in-session test file |
| T2 (`T2-question.md`) | Absent Redis cache: abstain, no junk | Session 97de858e, `tests/T2.md` | Query verbatim; rubric from in-session file |
| T3 (`T3-regex-recognizer.ts`) | Regex question recognizer (task) | Session 97de858e, `tests/T3.md` | Reconstructed (per run doc). 2026-10-09 raw prompt included, verbatim from benchmark-data |
| T4 (`T4-typed-ast-helper.ts`) | Typed AST helper (task, 7 checks) | Session 97de858e, `tests/T4.md` | Reconstructed (per run doc). 2026-10-09 raw prompt included, verbatim from benchmark-data |
| T5 (`T5-module-vs-local.md`) | Module OPTIONS vs shadowing local (async) | Session 97de858e, `tests/T5.md` + harness query | Query verbatim; gold/rubric from in-session file |
| T6 (`T6-groupby-repair.js`) | groupBy repair (hard pass) | `scripts/experimental/run-capability-matrix-f1.cjs` | Verbatim (checked identical); system prompt default |
| T7 (`T7-shadowed-local.md`) | Shadowed local dict (hard pass) | Session 97de858e, `tests/T7.md` + harness query | Query verbatim; gold/rubric from in-session file |

Notes:
- Harness: `run-tests.ts` in session 97de858e. T1/T2/T5/T7 use `local_explore_repo` queries; T3/T4/T6 send the fenced block of `tests/T*.md`.
- T6 used the default system prompt `You are a specialized sub-agent assistant.`
- T5/T7 run on the py-scopes fixture (not saved in repo).
- The T1 gold lines in the file include `src/index.ts` guards the packer never returned (see run doc).
- Code-task files are `.ts`/`.js` with the prompt inside a block comment.
