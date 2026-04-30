# Entity Plugins

Entity plugins define content types — each owns one entity type with its schema, adapter, and optional generation handler, templates, datasources, and derived-entity projections.

Entity plugins extend `EntityPlugin` and have **zero tools**. All entity CRUD goes through the system plugin's `system_create`, `system_update`, `system_delete`, and `system_extract` tools.

## Create flow pattern

`system_create` is the single entry point for entity creation.

If an entity type needs custom create behavior, its plugin should override `EntityPlugin.interceptCreate()`.
That interceptor can:

- return `handled` to fully own creation
- return `continue` to fall back to the shared create flow

Use `interceptCreate()` for entity-specific create logic such as:

- validating or rewriting create input
- resolving target entities before generation
- turning generic create requests into specialized jobs
- filling required metadata that generic create does not know about
- semantic dedup before create

Examples in the repo:

- `link` intercepts `system_create` to route URL capture correctly
- `image` intercepts `system_create` to resolve/validate cover-image targets
- `wish` intercepts `system_create` to populate required metadata and deduplicate requests

## Projection pattern

Derived entities are maintained by explicit projection jobs, declared with `getDerivedEntityProjections()`.
Projection jobs own their sync/source lifecycle and are queued by the projection runner after initial sync or source changes.

`system_extract` queues `{entityType}:project` jobs for manual derive/rebuild requests.

## Plugins

| Plugin       | Entity Type   | Projection | Description                                              |
| ------------ | ------------- | ---------- | -------------------------------------------------------- |
| blog         | `post`        |            | Blog posts with frontmatter, publish pipeline, RSS       |
| decks        | `deck`        |            | Slide decks with markdown directives                     |
| note         | `base`        |            | Personal notes with markdown-first workflow              |
| link         | `link`        |            | Web links with AI-powered content extraction             |
| portfolio    | `project`     |            | Portfolio projects with structured case studies          |
| newsletter   | `newsletter`  |            | Email newsletters with publish pipeline                  |
| wishlist     | `wish`        |            | Unfulfilled user requests with semantic dedup            |
| products     | `product`     |            | Product entities with marketing overview                 |
| image        | `image`       |            | AI image generation                                      |
| site-info    | `site-info`   |            | Site metadata — title, description, CTA, theme           |
| series       | `series`      | yes        | Cross-content series, projected from seriesName field    |
| topics       | `topic`       | yes        | AI-extracted topics from posts, links, and other content |
| skill        | `skill`       | yes        | A2A capabilities projected from topics and tools         |
| summary      | `summary`     |            | Conversation summaries generated from digest events      |
| social-media | `social-post` |            | Social media posts generated from published content      |

## vs plugins/

`plugins/` contains `ServicePlugin` packages — plugins that provide tools, orchestrate workflows, or integrate with external services (system, content-pipeline, directory-sync, site-builder, analytics, dashboard, buttondown, notion, hackmd, etc.).
