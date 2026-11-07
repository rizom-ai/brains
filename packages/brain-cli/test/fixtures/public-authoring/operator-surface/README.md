# Reading operator surface — public contract fixture

This standalone package is the checked authoring target for the additive public
operator-surface contract. It compiles against the local public service entry,
and every imported helper is classified in the stable export ledger. The
combined Phase 6 packed consumer installs the Account settings, Dashboard, and
Studio contracts from standalone tarballs.

The target package demonstrates one service-family import and three related
capabilities. Definitions are validated and frozen at module scope; their
loaders/actions bind once inside the typed service factories after setup:

- principal-owned reading-provider settings, including one write-only secret;
- an independently declared schema-validated Dashboard widget; and
- an independently declared schema-validated Studio workspace with typed query
  state, an entity catalog, a durable-job action, prepared confirmation, and a
  form action that writes the package's own `queued-reading` type as the
  operator who submitted it; and
- a provider connection: a launch action claims a single-use state for the
  operator's account and Studio session and sends their browser to the
  provider's consent page, and the provider's `protocol` callback route
  redeems it to write that operator's settings and returns the browser to the
  workspace with how the connection went; the workspace loader reads the token
  back sealed, and only `reveal()` hands the provider call the string.

Every loader and action acts as its caller: loaders read at the caller's
visibility, and `src/caller-type-canary.ts` pins that only an action writes,
and only the package's own types.

The source intentionally contains no package identity plumbing, registry call,
host route, renderer name, UI-framework import, process role, or private
workspace dependency. Dashboard and Studio receive their distinct typed semantic view profiles; the hosts own markup, themes, loading/error states, confirmation, routing, accessibility, query URLs, and lifecycle.

The `>=0.2.0-alpha.313 <0.3.0` peer range names the first published Brain
release containing this fixture's complete contract, including semantic view
heads, status, cards, and primary/aside columns. Exact registry evidence checks
that floor against the published package alongside runtime, host, and local
packed-consumer coverage.

See [CAPABILITY_INVENTORY.md](./CAPABILITY_INVENTORY.md) for the complete
capability inventory and the
[stable authoring ledger](../../../../../../docs/public-release/AUTHORING_API_0.2.md)
for the delivered contract. Generic workspace-definition launch references
remain a separate future contract change. [PORTS.md](./PORTS.md) remains the
historical four-workspace Phase 1 sketch.
