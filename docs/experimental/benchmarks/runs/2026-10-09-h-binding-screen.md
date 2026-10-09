# H binding screen — 2026-10-09

Frozen before generation at `2026-10-09T09:36:57Z`. The exact questions and
required source lines are in
[`2026-10-09-h-binding-screen.json`](2026-10-09-h-binding-screen.json).

The source is the official NestJS public sample `sample/19-auth-jwt` at pinned
commit `0498c13a63239fdef2d964acee67b57a22f87c65`. The origin manifest records
the upstream paths and hashes. The two-file Git snapshot is at
`d7c2d7095c857f3b8676f1883dbc9bb46d97ed87`. Direct checks matched both recorded
hashes and every frozen rubric line. The reviewed source windows are:

- `src/auth/constants.ts:1-4`: named `jwtConstants` with a multiline `secret`
  field whose value is an explicit warning placeholder literal.
- `src/auth/auth.module.ts:1-2,4,7-8,10-23,29`: imports `Module`, `APP_GUARD`,
  `UsersModule`, `AuthService`, and `jwtConstants`; uses `UsersModule` in
  `imports`, `AuthService` in `providers`, pairs `APP_GUARD` with `AuthGuard`,
  and passes `jwtConstants.secret` to `JwtModule.register` within the named
  `AuthModule`.

The original proposed `nest-auth-api` source was rejected because its
`jwtConstants` property case already appears in the frozen provenance fixture.
The lead's bounded local scout found no fresh production pair. This replacement
is a public framework sample. It uses the same domain and symbol names as prior
material, so it has structural overlap and does not measure independent
generalization. The example contains no `JWT_SECRET` environment key; do not
reuse the previous environment-specific question. No fresh real-source
direct-default-import locally-constructed-instance positive is included.

The first question names the configuration property explicitly so it exercises
the imported-configuration checklist without implying a provider-factory
request. The second asks about configuration metadata within the named
`AuthModule`, including the module decorator context, configuration use and
provider token entries. The `AuthGuard` implementation and `AuthController`
behavior require files outside this slice and remain unresolved.

The runner schema follows `run-local-explore-repo-smoke.ts`: frozen file hashes,
question IDs and text, `kind`, and exact `{file,line,text}` requirements. Its
candidate-supplied and exact-selected counts remain separate from
`parent_completion`. The queries describe source text only. Generic packed lines
do not establish semantic support, and this screen does not establish runtime
environment values, initialization, dependency-injection resolution, or guard
behavior. Keep `needs_review` pending parent interpretation.

## H run and source review

The two implementation fixes were committed as `11fd4eb` and `e396f13`. The
integrated implementation snapshot, based on `ce862c4`, passed 90 tests plus
the project check and held-out runner. The frozen H artifact records its
implementation snapshot as `d3f2248`. H was
`qwen-context:h-q4_0-24k`, digest `72e74925c51e`, with the saved 24576 context,
2048 output ceiling and thinking disabled. Placement was 100% GPU. The complete
artifact has four calls; all ended with a normal `stop`, and both exact-source
audits passed. The supervisor exited and its lock is free.

| Question | Required | Supplied | Selected | H status | Time |
|---|---:|---:|---:|---|---:|
| Imported `jwtConstants.secret` property | 7 | 7 | 6 | `needs_review` | 20.112 s |
| Module and guard-token metadata | 15 | 15 | 12 | `needs_review` | 17.025 s |

The first answer omitted the `AuthModule` declaration at line 29. The second
omitted the `providers` array at line 19, `AuthService` use at line 20, and
`AuthModule` declaration at line 29. All selected quotes matched their source
lines. The raw frozen run artifact is
`benchmark-data/h-binding-screen-2026-10-09-h.json`; its fixture SHA-256 is
`13717f8a6dc87f8039aea91ceabc713ca07c2448cc3c463637c2f3ca9392ce51`.

Parent review used additional reads within the same two-file slice and completed
both bounded source questions. The source shows the named constant's warning
placeholder passed to JWT registration; it places `UsersModule` in `imports`,
`AuthService` in `providers`, and pairs `APP_GUARD` with `AuthGuard` in the
provider object. This source review does not establish runtime environment
values, dependency-injection resolution or guard behavior. `AuthGuard`
implementation and `AuthController` behavior require files outside the slice;
generic provider provenance for question two also remains unresolved.

The screen is a public framework sample with structural overlap, not production
or independent-generalization evidence. No fresh production case or real-source
default-import locally constructed-instance positive was available. H supplied
every rubric line but still missed the reader declaration and provider
registration/use lines at selection time. Develop those selection gaps
separately and look for fresh production and instance candidates; do not tune
or rerun this frozen screen.
