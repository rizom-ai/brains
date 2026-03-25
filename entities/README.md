# Entity Plugins

Entity plugins define content types — each owns one entity type with its schema, adapter, and optional generation handler, templates, and datasources.

Entity plugins extend `EntityPlugin` and have **zero tools**. All entity CRUD goes through the system plugin's `system_create`, `system_update`, and `system_delete` tools.

## Plugins

| Plugin       | Entity Type   | Description                                              |
| ------------ | ------------- | -------------------------------------------------------- |
| blog         | `post`        | Blog posts with frontmatter, publish pipeline, RSS       |
| series       | `series`      | Cross-content series, auto-derived from seriesName field |
| decks        | `deck`        | Slide decks with markdown directives                     |
| link         | `link`        | Web links with AI-powered content extraction             |
| note         | `base`        | Personal notes with markdown-first workflow              |
| portfolio    | `project`     | Portfolio projects with structured case studies          |
| products     | `product`     | Product entities with marketing overview                 |
| summary      | `summary`     | Conversation summaries, auto-derived from digests        |
| social-media | `social-post` | Social media posts, auto-derived from published content  |
| topics       | `topic`       | AI-extracted topics from posts, links, and other content |
| wishlist     | `wish`        | Unfulfilled user requests with semantic dedup            |

## vs plugins/

`plugins/` contains `ServicePlugin` and `CorePlugin` packages — plugins that provide tools, orchestrate workflows, or manage infrastructure (system, content-pipeline, newsletter, directory-sync, site-builder, image, analytics, dashboard, etc.).
