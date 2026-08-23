# Entity Plugins

Entity plugins define content types — each owns one entity type with its schema, adapter, and optional generation handler, templates, datasources, and projection rules.

Entity plugins extend `EntityPlugin` and have **zero tools**. Entity CRUD goes through the system plugin's shared create, update, and delete tools.

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

Derived entities are maintained only by immutable `ProjectionRule`s declared with `getProjectionRules()`. `PluginManager` validates one acyclic entity-source graph, while the shell scheduler coalesces committed source mutations into topological waves. Each reachable rule runs at most once per wave, fingerprints its complete immutable input, and returns canonical write intents. The framework skips unchanged inputs and semantic no-op writes.

There is no event-owned projection job or manual derive/rebuild tool. Command-owned generation remains an ordinary job workflow.

## Plugins

| Plugin              | Entity Type                          | Projection | Description                                              |
| ------------------- | ------------------------------------ | ---------- | -------------------------------------------------------- |
| agent-discovery     | `agent`, `skill`                     | yes        | Discovered peer brains and their projected capabilities  |
| assessment          | `swot`                               | yes        | SWOT assessments derived from other content              |
| blog                | `post`                               |            | Blog posts with frontmatter, publish pipeline, RSS       |
| conversation-memory | `summary`, `decision`, `action-item` |            | Read/evaluate stored team memory entities                |
| decks               | `deck`                               |            | Slide decks with markdown directives                     |
| doc                 | `doc`                                |            | Documentation pages rendered on the site                 |
| document            | `document`                           |            | Uploaded binary artifacts (PDFs and similar files)       |
| image               | `image`                              |            | AI image generation                                      |
| link                | `link`                               |            | Web links with AI-powered content extraction             |
| note                | `note`                               |            | Personal notes with markdown-first workflow              |
| portfolio           | `project`                            |            | Portfolio projects with structured case studies          |
| products            | `product`                            |            | Product entities with marketing overview                 |
| prompt              | `prompt`                             |            | Reusable prompt entities                                 |
| series              | `series`                             | yes        | Cross-content series, projected from seriesName field    |
| site-info           | `site-info`                          |            | Site metadata — title, description, CTA, theme           |
| social-media        | `social-post`                        | yes        | Social media posts generated from published content      |
| style-guide         | `style-guide`                        |            | Singleton messaging, voice, and visual guidance          |
| topics              | `topic`                              | yes        | AI-extracted topics from posts, links, and other content |
| wishlist            | `wish`                               |            | Unfulfilled user requests with semantic dedup            |

Note the one-character trap: `doc` is documentation _pages_ (site content), while `document` is uploaded binary _files_. They are distinct entity types; both ship in rover.

## vs plugins/

`plugins/` contains `ServicePlugin` packages — plugins that provide tools, orchestrate workflows, or integrate with external services (content-pipeline, directory-sync, site-builder, analytics, dashboard, newsletter, studio, playbooks, etc.).
