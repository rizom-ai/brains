# @brains/dashboard

Host for public declarative Dashboard widgets.

The Dashboard registry accepts only `DeclarativeOperatorWidget` registrations.
Plugin packages declare widgets with `defineDashboardWidget()` from
`@rizom/brain/services`; the runtime scopes IDs, validates data and views, and
registers them after plugin setup. Public definitions stay on Dashboard.
Trusted and Admin definitions are automatically re-homed into Studio Overview
through the same semantic registration, so providers do not duplicate views or
depend on either host.

The host owns all markup, styles, browser behavior, routes, accessibility, and
responsive layout. Widget authors provide no React component, HTML, CSS,
script, renderer key, or internal URL. The closed semantic protocol includes
stats, facts, notices, links, lists, tables, tabs, filters, matrices, spatial
views, groups, flows, meters, progress, and host-resolved launch intents.

The Dashboard page invokes only Public widget callbacks, even when the request
belongs to an Admin session. Re-homed Overview callbacks receive the canonical
operator, visibility-scoped entity reads, typed jobs, secret-redacted
current-principal settings, and cancellation. An absent Dashboard and Studio
host is a true no-op, and execution-only workers do not bind widget callbacks.

The host serves its CSS, interaction controller, and configured theme CSS from
same-origin content-addressed URLs under `<routePath>/assets/`.

See:

- [`docs/external-plugin-authoring.md`](../../docs/external-plugin-authoring.md)
- [stable authoring ledger](../../docs/public-release/AUTHORING_API_0.2.md)
- [checked operator fixture](../../packages/brain-cli/test/fixtures/public-authoring/operator-surface/src/index.ts)
