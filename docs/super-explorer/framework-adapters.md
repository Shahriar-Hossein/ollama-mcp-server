# Super Explorer framework adapters

Framework adapters are optional extractors that add domain facts after the
generic repository index is complete. They do not change symbols, references,
dependencies, inheritance, or call edges, and generic structural tools do not
load or query them.

The contract is in `src/super-explorer/framework-adapter.ts`:

- `FrameworkAdapter.supports()` decides whether an adapter applies to an
  indexed repository.
- `FrameworkAdapter.extract()` receives the immutable generic index and
  returns an `AdapterIndex` for that exact commit.
- Every `AdapterFact` is source-backed: it carries a repository-relative file,
  source range, containing stable symbol ID when one exists, and a resolution
  quality. Adapter-specific values belong in `attributes`.

Adapters use stable names such as `wordpress-woocommerce`; fact `kind` values
are interpreted only within that adapter's namespace. The caller must reject
an adapter result whose schema version, adapter name, or commit hash differs
from the active generic index. `extractAdapterFacts()` performs those checks.

The WordPress/WooCommerce adapter emits separate `hook_registration` and
`hook_emitter` facts for the literal hooks in indexed JavaScript and TypeScript
source. Registrations recognize `add_action` and `add_filter`; emitters
recognize `do_action`, `do_action_ref_array`, `apply_filters`, and
`apply_filters_ref_array`. Each fact includes the hook name (or `null` with
`unresolved` resolution for a dynamic name), invocation, hook type, and, for a
registration, the callback expression. Its containing symbol ID links back to
generic structural queries.

Run `npm run --silent wordpress-hooks:super-explorer -- <repository-root>` to
emit the adapter index, or `null` when the indexed checkout contains no known
hook invocation. PHP is deliberately not scanned yet because the generic
index currently supports only JavaScript and TypeScript; it must gain PHP
symbol support before PHP hook facts can satisfy the stable-symbol link.
Later adapter-specific tools may consume only that adapter's facts; they must
not be added to the generic tool surface.
