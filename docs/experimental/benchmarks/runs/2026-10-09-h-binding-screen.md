# H binding screen — 2026-10-09

Frozen before generation at `2026-10-09T09:36:57Z`. No model call has run. The
exact questions and required source lines are in
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

Deterministic prefreeze review supplied all required lines (7/7 and 15/15).
The imported `jwtConstants.secret` relationship was present with one
source-backed alternative in each applicable part; `UsersModule`, `AuthService`
and `APP_GUARD` imports were excluded from constant requirements. Both stubbed
results returned `needs_review`. AuthGuard/useClass, AuthController and generic
provider-provenance obligations remain unresolved in this bounded source slice.
Parent completion remains pending.

The H run is pending. Do not change the fixture or questions after generation.
