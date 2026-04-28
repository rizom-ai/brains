---
title: "Content Management"
section: "Content and entities"
order: 50
sourcePath: "docs/content-management.md"
slug: "content-management"
description: "brains treats content as typed markdown entities. You can work with those entities through chat/MCP tools, the CMS, direct markdown edits, or plugin-owned gener"
---

# Content Management Guide

`brains` treats content as typed markdown entities. You can work with those entities through chat/MCP tools, the CMS, direct markdown edits, or plugin-owned generation jobs. The same content graph powers search, agent context, CMS editing, and static-site publishing.

## Where content lives

A standalone brain stores markdown content under `brain-data/` by default.

```text
mybrain/
  brain.yaml
  brain-data/
    README.md
    post/my-first-post.md
    deck/my-first-deck.md
    image/cover.png
    site-info/site-info.md
```

Directory sync maps paths to entities:

- root markdown files are note entities with `entityType: "base"`
- files under `brain-data/<entity-type>/` use that directory as their entity type
- nested paths below the entity-type directory become colon-separated ids, for example `site-content/home/hero.md` becomes entity type `site-content` with id `home:hero`
- image files are supported under `brain-data/image/`

For the full list of built-in entity types and frontmatter fields, see [Entity Types Reference](/docs/entity-types-reference).

## Markdown shape

Most editable entities use YAML frontmatter plus a markdown body:

```markdown
---
title: My first post
status: draft
publishedAt: 2026-04-26T12:00:00.000Z
---

The markdown body goes here.
```

The runtime owns core fields such as `id`, `entityType`, `created`, `updated`, indexing data, and derived metadata. Entity adapters own the exact conversion between markdown and typed entities.

When editing by hand:

- keep frontmatter valid YAML
- keep dates as ISO strings when a schema expects `datetime`
- use the exact status values documented for each entity type
- prefer small frontmatter and put prose in the body
- do not edit generated cache/build outputs under `dist/`

## Ways to create and edit content

### Chat and MCP tools

All entity CRUD goes through shared system tools. Entity plugins intentionally do not expose one-off CRUD tools.

Common tools:

| Tool              | Purpose                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `system_create`   | Create or generate an entity. Use `content` for exact markdown, `prompt` for AI generation, or `url` for URL-first flows. |
| `system_update`   | Update fields or replace full content. Requires confirmation for writes.                                                  |
| `system_delete`   | Delete an entity. Requires confirmation.                                                                                  |
| `system_get`      | Fetch one entity by id, slug, or title.                                                                                   |
| `system_list`     | List entities by type, optionally filtered by status.                                                                     |
| `system_search`   | Search across entities, optionally filtered by type.                                                                      |
| `system_extract`  | Run derivation/extraction for entity types that support it.                                                               |
| `system_insights` | Return aggregate insights registered by the runtime or plugins.                                                           |

Examples:

```bash
brain tool system_create '{"entityType":"base","title":"Idea","content":"# Idea\n\nA short note."}'
brain tool system_search '{"query":"recent published posts","entityType":"post"}'
brain tool system_list '{"entityType":"post","status":"draft"}'
```

Use `fields` for frontmatter/metadata changes:

```bash
brain tool system_update '{
  "entityType":"post",
  "id":"my-first-post",
  "fields":{"status":"published"},
  "confirmed":true
}'
```

Use `content` only when you intentionally want to replace the full markdown content.

### CMS

When the `cms` plugin and `webserver` interface are active, the web surface exposes a CMS for editing configured entity types. Start the brain and open the local web host:

```bash
brain start
# open http://localhost:8080/cms
```

The CMS is most useful for frontmatter-driven content such as posts, decks, projects, site-info, site-content, products, and newsletters. Exact CMS collections depend on the selected brain model, preset, and active entity plugins.

### Direct markdown edits

When `directory-sync` is active, files in `brain-data/` are imported into the entity database and entity changes can be exported back to disk.

Typical workflow:

1. edit markdown under `brain-data/`
2. keep the brain running so file watching can import changes, or trigger a sync command/tool when available
3. commit content changes if `brain-data/` is backed by git

If `directory-sync.git` is configured, the content directory can sync with a remote content repository:

```yaml
plugins:
  directory-sync:
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
```

`directory-sync` also handles seed content on first run for shipped brain models. Seed content is copied only when the target `brain-data/` directory is effectively empty. For local `file://` git remotes, `git.bootstrapFromSeed` defaults to `true` and can create/seed a missing or empty bare remote from `seedContentPath`.

### Generation jobs

Some entity types own generation or capture workflows:

- links can be created from a URL and captured/summarized
- images can be uploaded as data URLs or generated from prompts
- posts, decks, newsletters, and social posts can be generated from prompts or source entities depending on active plugins
- topics, skills, and SWOT entries are usually derived from existing content

A create call may return `{ status: "generating", jobId }` instead of an immediate entity. Check job status through runtime tools or wait for progress in MCP/chat clients.

## Publishing workflow

Publishing-oriented entities usually use status fields.

| Entity type   | Status values                                       |
| ------------- | --------------------------------------------------- |
| `post`        | `draft`, `queued`, `published`                      |
| `deck`        | `draft`, `queued`, `published`                      |
| `project`     | `draft`, `published`                                |
| `link`        | `pending`, `draft`, `published`                     |
| `social-post` | `draft`, `queued`, `published`, `failed`            |
| `newsletter`  | `draft`, `queued`, `published`, `failed`            |
| `wish`        | `new`, `planned`, `in-progress`, `done`, `declined` |

The site builder renders the entities and routes enabled by the active site package, preset, and entity display config. For app/site verification, start the app and trigger a rebuild on the running app before inspecting generated output.

Preview output defaults to:

```text
dist/site-preview
```

Production output defaults to:

```text
dist/site-production
```

## Images and cover images

Image entities live under `entityType: "image"` and sync to `brain-data/image/` as image files. They can be referenced from other entities by `coverImageId`.

Common fields that accept image references:

- `post.coverImageId`
- `deck.coverImageId`
- `project.coverImageId`
- `series.coverImageId`
- `social-post.coverImageId`

For a generated/uploaded image intended as a cover, pass a target entity when creating it:

```bash
brain tool system_create '{
  "entityType":"image",
  "prompt":"Abstract cover image for a post about cooperative AI",
  "targetEntityType":"post",
  "targetEntityId":"cooperative-ai"
}'
```

The image plugin resolves the target entity id and can attach the generated image as the cover.

## Prompt customization

Prompt entities let you override or customize generation templates from content.

Example path:

```text
brain-data/prompt/blog-generation.md
```

Example frontmatter:

```markdown
---
title: Blog generation prompt
target: blog:generation
---

Write in a concise, practical style. Prefer concrete examples.
```

The `target` value maps to a template name registered by a plugin. Available template names depend on the active model and plugin set.

## Content safety checklist

Before publishing or deploying content:

- check that frontmatter validates for the entity type
- confirm status values are intentional
- verify cover image ids resolve
- run a preview rebuild on the running app
- inspect `dist/site-preview` before production deploys
- keep secrets in `.env` / deployment secrets, never in markdown

## Related docs

- [Entity Types Reference](/docs/entity-types-reference)
- [Extensible Entity Model](/docs/entity-model)
- [brain.yaml Reference](/docs/brain-yaml-reference)
- [CLI Reference](/docs/cli-reference)
- [Deployment Guide](/docs/deployment-guide)
