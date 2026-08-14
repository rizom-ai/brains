# Reading operator surface — public contract fixture

This standalone package is the checked authoring target for the additive public
operator-surface contract. It compiles against the local public service entry,
and every imported helper is classified in the stable export ledger. Account
settings and the Dashboard host runtime are implemented; CMS hosting and the
combined packed standalone proof remain later phases, so this fixture is not
yet presented as a runtime-complete API.

The target package demonstrates one service-family import and three related
capabilities. Definitions are validated and frozen at module scope; their
loaders/actions bind once inside the typed service factories after setup:

- principal-owned reading-provider settings, including one write-only secret;
- an independently declared schema-validated Dashboard widget; and
- an independently declared schema-validated CMS workspace with a typed
  durable-job action.

The source intentionally contains no package identity plumbing, registry call,
host route, renderer name, UI-framework import, process role, or private
workspace dependency. Dashboard and CMS receive semantic `OperatorView` blocks;
the hosts own markup, themes, loading/error states, confirmation, routing, and
lifecycle.

The `>=0.2.1 <0.3.0` peer range is provisional because this additive milestone
does not gate `v0.2.0`. Phase 7 must replace the lower bound with the first
actual `0.2.x` version containing the accepted contract.

See [PORTS.md](./PORTS.md) for the four built-in port sketches and the contract
gaps they exposed.
