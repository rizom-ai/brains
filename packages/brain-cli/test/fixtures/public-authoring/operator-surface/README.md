# Reading operator surface — Phase 0 target

This standalone package is the source-first target for the additive public
operator-surface contract. It deliberately precedes runtime helpers. During
Phase 0 it is checked for authoring shape and forbidden vocabulary, but it is
not compiled, packed, included in the stable export ledger, or presented as a
shipped API.

The target package demonstrates one service-family import and three related
capabilities:

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
