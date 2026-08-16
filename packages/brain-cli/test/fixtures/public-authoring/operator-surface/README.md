# Reading operator surface — public contract fixture

This standalone package is the checked authoring target for the additive public
operator-surface contract. It compiles against the local public service entry,
and every imported helper is classified in the stable export ledger. Account settings, Dashboard, and CMS are runtime-complete, and the combined Phase 6 packed consumer installs all three contracts from standalone tarballs.

The target package demonstrates one service-family import and three related
capabilities. Definitions are validated and frozen at module scope; their
loaders/actions bind once inside the typed service factories after setup:

- principal-owned reading-provider settings, including one write-only secret;
- an independently declared schema-validated Dashboard widget; and
- an independently declared schema-validated CMS workspace with typed query
  state, an entity catalog, a durable-job action, and prepared confirmation.

The source intentionally contains no package identity plumbing, registry call,
host route, renderer name, UI-framework import, process role, or private
workspace dependency. Dashboard and CMS receive their distinct typed semantic view profiles; the hosts own markup, themes, loading/error states, confirmation, routing, accessibility, query URLs, and lifecycle.

The `>=0.2.1 <0.3.0` peer range is provisional because this additive milestone
does not gate `v0.2.0`. Release nomination must replace the lower bound with the first actual `0.2.x` version containing the complete contract.

See [CAPABILITY_INVENTORY.md](./CAPABILITY_INVENTORY.md) for the current
Phase 4 completeness baseline. [PORTS.md](./PORTS.md) remains the historical
four-workspace Phase 1 sketch.
