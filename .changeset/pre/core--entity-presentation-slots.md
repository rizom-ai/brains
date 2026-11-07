---
"@brains/plugins": patch
"@brains/site-composition": patch
"@brains/blog": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

`defineEntity` now accepts `templates` and `feed`, `defineEntityPackage` accepts `dataSources`, and `@rizom/brain/entities` exports `defineDataSource`, `DataSourceDefinition`, `DataSourceEntityReader`, `EntityDataSourceDefinition`, `EntityFeedDeclaration` and `FeedItem`. A data source either fetches through reads typed by the definitions it names, or lists and shows one declared entity type, with the runtime deriving that type's schema from its definition and handling ordering, paging, filtering, lookup and neighbors. Data source ids are scoped to the package, and templates follow a package data source to its scoped id. A declared feed is written as RSS into every site build, with every record in a preview and only published ones in production, and a malformed item fails the build. Blog RSS feeds no longer break when a post's body contains `]]>`.
