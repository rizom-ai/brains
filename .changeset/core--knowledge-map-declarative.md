---
"@brains/knowledge-map": minor
"@brains/sdk": minor
---

Migrate `@brains/knowledge-map` to the declarative surface. The
ServicePlugin class and the DataSource class are deleted; the map is a
declared data source, a declared template and a declared dashboard widget.

**The data source and template ids are now package-scoped.** The runtime
scopes local ids to the installing package, so `knowledge-map:map` becomes
`@brains/knowledge-map:map`. A site route naming the template must be
updated; `sites/rizom-ai` is.

Three capabilities, each measured:

- `dataSources` on a service definition — a source that belongs to no one
  entity type. Consumers: knowledge-map, dashboard, site-builder,
  unified-inbox.
- `render` on `defineDashboardWidget` — a widget whose component draws it,
  with the declarative view and digest still derived from the same data, so
  a console that cannot run the component still has something to show.
  Reaching this previously required `registerBuiltInDashboardWidget`, which
  is shell-internal.
- `corpus` on the operator context — `project` and untyped `listEntities`,
  capped at the caller's visibility. The `entities` reader stays
  definition-typed on purpose; a map of the whole brain has no declaration
  to ask through, because `project({})` takes no type filter.
