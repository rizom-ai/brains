---
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/doc": minor
"@brains/utils": patch
---

Add a declarative entity presentation surface: `defineEntity` now accepts `templates` and `dataSources`, and `defineEntityDataSource` declares an entity-backed data source as configuration plus pure functions over already-loaded entities. The runtime keeps every entity read on its own side, which is what allows this to be published — the `DataSource` interface itself cannot cross the published declaration boundary, because its `fetch` takes a context carrying a scoped entity service.

`@brains/doc` is migrated to that surface and now imports only `@brains/sdk/entities`, making it the third publishable-clean entity package. Its plugin id is now the package-scoped `@brains/doc:doc`, matching the other declarative packages.

Also adds `LoggerContract`, a structural interface `Logger` satisfies. `Logger` is a class with private fields, so an inlined copy in generated declarations is nominally distinct and nothing is assignable between them; anything handed to plugin authors is typed as the contract instead.
