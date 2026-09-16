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

The initial WordPress/WooCommerce adapter will emit separate facts for hook
registrations and emitters, with the containing symbol ID linking each fact
back to generic structural queries. Later adapter-specific tools may consume
only that adapter's facts; they must not be added to the generic tool surface.
