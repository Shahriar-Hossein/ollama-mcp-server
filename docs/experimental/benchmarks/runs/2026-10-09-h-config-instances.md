# Default-instance context and configuration-value filtering

Continues [imported values and initialization order](2026-10-09-h-config-order.md).
The earlier source screen, questions and raw artifacts remain unchanged.

## Change

Module arrays and provider/injection tokens no longer create imported
configuration-value requirements. Actual value uses, including provider
`useValue`, still require their import, initializer and named reader. Class-bound
constant reads now require the nearest reader declaration as well.

`local-explore-instances.ts` adds context for a direct default-import method call
whose source exports a local construction or a top-level const instance. The
checklist retains the import, call, export, construction, class, constructor
arguments/body and reader declaration/body. Literal named reads exclude comments
and nested examples. Arguments preserve `process.env`, scalar member reads and
object copies as distinct source expressions; they do not establish runtime
capture semantics or provider identity.

Shadowing, reassignment, mutable instance bindings, factory exports, reexports,
spread arguments and unresolved constructors/readers remain unresolved. All
instance semantics and initialization order require parent review. Six-file,
character, input and two-call limits remain; oversized constructor context
refuses generation. The runner records the new module's implementation hash.

## Verification

All 81 scout tests pass, including seven new regressions for token filtering,
direct instances, argument forms, unresolved bindings, reader scope, literal keys
and end-to-end selection/overflow. Development generation is stubbed. The runner
regression, its explicit TypeScript check and `npm run check` pass; lint retains
existing warnings. `git diff --check` passes.

No fresh H generation was run for this change. These checks establish development
contracts, not improved model selection or unseen-repository completeness.

## Next step

Freeze fresh source questions and rubrics after independent bounded discovery.
Include a supported real-source named-constant positive, a direct default-import
instance and a module/provider-token contrast. Use different source cases from
the frozen initialization-order screen. Run one locked H supervisor, recording
supplied and selected rubric lines separately from parent completion. Keep
runtime order and provider conclusions outside model-selection scores.
