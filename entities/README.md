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

Derived entities are maintained by explicit projection jobs, normally declared with `getDerivedEntityProjections()`. Custom projection execution must return an equivalent immutable declaration from `getProjectionDeclarations()`.
Projection declarations are registered as plugin capabilities and validated as one entity/event graph before initial sync. Projection jobs own their sync/source lifecycle and are queued with causal provenance after initial sync or source changes. AI-backed projections persist fingerprints of their effective source revisions and generation configuration in runtime state, then skip unchanged inputs. Reconcilers and handlers must also compare semantic output so operational timestamps do not create entity mutations.

`system_extract` queues `{entityType}:project` jobs for manual derive/rebuild requests.

## Plugins

| Plugin              | Entity Type                          | Projection | Description                                              |
| ------------------- | ------------------------------------ | ---------- | -------------------------------------------------------- |
| agent-discovery     | `agent`, `skill`                     | yes        | Discovered peer brains and their projected capabilities  |
| assessment          | `swot`                               | yes        | SWOT assessments derived from other content              |
| blog                | `post`                               |            | Blog posts with frontmatter, publish pipeline, RSS       |
| conversation-memory | `summary`, `decision`, `action-item` | yes        | Conversation summaries generated from message events     |
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

`plugins/` contains `ServicePlugin` packages — plugins that provide tools, orchestrate workflows, or integrate with external services (content-pipeline, directory-sync, site-builder, analytics, dashboard, newsletter, cms, playbooks, etc.).
