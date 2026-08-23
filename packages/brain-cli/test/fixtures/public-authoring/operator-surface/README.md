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
  state, an entity catalog, a durable-job action, and prepared confirmation.

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
