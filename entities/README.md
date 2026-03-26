# Entity Plugins

Entity plugins define content types — each owns one entity type with its schema, adapter, and optional generation handler, templates, and datasources.

Entity plugins extend `EntityPlugin` and have **zero tools**. All entity CRUD goes through the system plugin's `system_create`, `system_update`, `system_delete`, and `system_extract` tools.

## Plugins

| Plugin       | Entity Type   | derive() | Description                                              |
| ------------ | ------------- | -------- | -------------------------------------------------------- |
| blog         | `post`        |          | Blog posts with frontmatter, publish pipeline, RSS       |
| decks        | `deck`        |          | Slide decks with markdown directives                     |
| note         | `base`        |          | Personal notes with markdown-first workflow              |
| link         | `link`        |          | Web links with AI-powered content extraction             |
| portfolio    | `project`     |          | Portfolio projects with structured case studies          |
| newsletter   | `newsletter`  |          | Email newsletters with publish pipeline                  |
| wishlist     | `wish`        |          | Unfulfilled user requests with semantic dedup            |
| products     | `product`     |          | Product entities with marketing overview                 |
| image        | `image`       |          | AI image generation                                      |
| site-info    | `site-info`   |          | Site metadata — title, description, CTA, theme           |
| series       | `series`      | yes      | Cross-content series, auto-derived from seriesName field |
| topics       | `topic`       | yes      | AI-extracted topics from posts, links, and other content |
| summary      | `summary`     | yes      | Conversation summaries, auto-derived from digests        |
| social-media | `social-post` | yes      | Social media posts, auto-derived from published content  |

## derive() — Event-Driven Entities

Plugins with `derive()` auto-maintain their entities in response to events. They subscribe to entity or conversation events in `onRegister()` and call `derive()` to create/update/delete derived entities.

`system_extract { entityType: "post" }` triggers `deriveAll()` for batch reprocessing.

## vs plugins/

`plugins/` contains `ServicePlugin` packages — plugins that provide tools, orchestrate workflows, or integrate with external services (system, content-pipeline, directory-sync, site-builder, analytics, dashboard, buttondown, notion, hackmd, etc.).
