---
"@brains/plugins": patch
---

Pin the published plugin surface to what the runtime actually provides.

`src/public/types.ts` is the authoring surface published as
`@rizom/brain/plugins`, and it restates internal types on purpose: the runtime
`BasePluginContext` carries 46 members against the published 23, withholding
`jobs`, `runtimeState`, `plugins`, `endpoints`, `gitBrokerSocket` and the rest,
and weakening `IViewsNamespace` / `IServiceTemplatesNamespace` so internal
template types stay out of the generated declarations.

Nothing checked that the narrower surface was still _true_. `Plugin.description`
and `Plugin.dependencies` were declared without `| undefined` while the runtime
derives them from `pluginMetadataSchema` with it, so under
`exactOptionalPropertyTypes` the runtime `Plugin` did not satisfy the published
one. Fixed, and a typecheck-time assertion now holds the invariant for fifteen
context and namespace pairs: narrowing stays legal, promising something the
runtime lacks does not.
