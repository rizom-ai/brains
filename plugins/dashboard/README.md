# @brains/dashboard

Public brain card fed by public declarative data.

The Dashboard route is anonymous-facing and always renders exactly four tabs:
**Overview**, **Knowledge**, **Network**, and **System**. Overview explains the
brain's public identity and ownership boundary, lists public contact doors and
entity holdings, and shows advertised skills in the mockup's fixed four-card
composition. Knowledge renders the public topic/corpus projection as a semantic
map; Network renders the public agent directory as a proximity map. System is
always last and summarizes public surface availability, map freshness, runtime
metadata, and render-time checks without exposing private operations.

The Dashboard registry accepts only `DeclarativeOperatorWidget` registrations.
Plugin packages declare widgets with `defineDashboardWidget()` from
`@rizom/brain/services`; the runtime scopes IDs, validates data and views, and
registers them after plugin setup. Public definitions feed the fixed skills and
map slots rather than appending generic cards below Overview. Trusted and Admin
definitions are automatically re-homed into Studio Overview through
the same semantic registration, so providers do not duplicate views or depend
on either host.

Every card request loads entity counts at Public visibility and invokes only
Public widget callbacks with an anonymous Public caller—even when the browser
has an Admin session. Session state affects only console chrome: the Studio
operator door appears when an active session passes Studio's gate. Restricted
endpoints, interactions, internal paths, private diagnostics, operator activity,
and widget data do not enter the card.

The host owns all markup, styles, browser behavior, routes, map renderers,
accessibility, and responsive layout. Widget authors provide no React
component, HTML, CSS, script, renderer key, or internal URL. The closed semantic
protocol includes stats, facts, notices, links, lists, tables, tabs, filters,
matrices, spatial views, groups, flows, meters, progress, and host-resolved
launch intents.

The host serves its CSS, interaction controller, and configured theme CSS from
same-origin content-addressed URLs under `<routePath>/assets/`.

See:

- [`docs/external-plugin-authoring.md`](../../docs/external-plugin-authoring.md)
- [stable authoring ledger](../../docs/public-release/AUTHORING_API_0.2.md)
- [checked operator fixture](../../packages/brain-cli/test/fixtures/public-authoring/operator-surface/src/index.ts)
