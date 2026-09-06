---
"@brains/site-builder-plugin": minor
"@brains/site-engine": patch
"@brains/plugins": minor
"@brains/sdk": minor
"@rizom/brain": patch
---

Migrate `@brains/site-builder-plugin` to the declarative surface. The package is one `defineServicePlugin` (`site-builder`) importing `@brains/sdk` plus the shared libraries it already used; `SiteBuilderPlugin` and `siteBuilderPlugin` are deleted, and the default export is the service a brain composes. The runtime plugin id is `@brains/site-builder-plugin:site-builder`.

Everything the plugin used to do imperatively is now declared. The nine route, slot, head-script, metadata and projection-wave subscriptions are `defineSubscription` declarations whose payload schemas are the boundary, so a malformed registration is refused before a handler runs. The site build is a `defineJob` declaration whose handler is a plain function over its collaborators rather than a `BaseJobHandler` subclass. The three site resources, the navigation data source, the build tool, the Studio workspace, the dashboard health widget and the static output directories are all declarations. The rebuild manager no longer subscribes to the bus or reaches a plugin context: it takes the declared jobs handle and is told about a finished projection wave.

Five runtime capabilities were added, each with a named consumer:

- `staticSite`, the slot naming the directories the runtime serves for a package that builds a site.
- `jobs.recent()` and `jobs.find(id)`, so a package can read its own queued work — the last few runs whatever became of them, and one run by the id a restart left behind. Types are the package's own job names; the runtime scopes them to the queue's names and reports the declared ones back.
- `oncePending` on a job declaration, saying what "the same work" means so a second request while one is already waiting hands back the waiting job instead of queueing a duplicate build.
- `jobId` on the job handler context, so a handler that keeps a projection of its own runs can record each outcome against the id the requester holds.
- `SerializedStatusStore` and `StaticSiteOutput` on the SDK surface, for a package that keeps one bounded status document and names its output directories.

Two seams narrowed. `SiteBuilderServices` now takes a read-only entity reader and separate ask and announce halves of messaging, because a build reads records and writes files: the staging hand-off is a broadcast rather than a question. `ImageBuildService` takes the same narrow reader.

The `templates` configuration field is removed. It let a caller hand the site builder arbitrary runtime templates to register; a package declares its own templates and views, and nothing in the repo set the field.
