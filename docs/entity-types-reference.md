# Entity Types Reference

`brains` stores durable knowledge as typed markdown entities. Each entity type is registered by an entity plugin, validated with Zod, indexed for search, exposed through system tools, and optionally rendered by the site builder.

## Storage conventions

Directory sync maps files in `brain-data/` to entities by path:

- root markdown files are note entities with `entityType: "base"`
- files under `brain-data/<entity-type>/` use that directory name as the entity type
- nested paths below the entity-type directory become colon-separated ids: `site-content/home/hero.md` becomes entity type `site-content` with id `home:hero`
- image files are supported under `brain-data/image/`

Most content entities use YAML frontmatter plus a markdown body:

```markdown
---
title: My first post
status: draft
---

Markdown body goes here.
```

Core fields such as `id`, `entityType`, `created`, `updated`, and the markdown body are managed by the runtime and adapters. Frontmatter fields are the user-editable fields for each type.

## Model availability

| Entity type         | Registered by             | Rover         | Relay       | Ranger      | Notes                                                                            |
| ------------------- | ------------------------- | ------------- | ----------- | ----------- | -------------------------------------------------------------------------------- |
| `anchor-profile`    | identity service          | all presets   | all presets | all presets | Singleton identity/profile for the person, team, or collective behind the brain. |
| `brain-character`   | identity service          | all presets   | all presets | all presets | Singleton persona/instructions source for the brain.                             |
| `base`              | `@brains/note`            | all presets   | all presets | default     | Root-level notes and general markdown knowledge.                                 |
| `prompt`            | `@brains/prompt`          | all presets   | all presets | default     | Prompt/template overrides.                                                       |
| `link`              | `@brains/link`            | all presets   | all presets | default     | Captured links and extracted summaries.                                          |
| `wish`              | `@brains/wishlist`        | all presets   | —           | default     | User requests and roadmap wishes.                                                |
| `topic`             | `@brains/topics`          | all presets   | all presets | —           | Derived topic clusters from source content.                                      |
| `agent`             | `@brains/agent-discovery` | all presets   | all presets | —           | Saved peer-brain / A2A contacts.                                                 |
| `skill`             | `@brains/agent-discovery` | all presets   | all presets | —           | Derived advertised skills for agent cards.                                       |
| `swot`              | `@brains/assessment`      | all presets   | all presets | —           | Derived assessment output from agent/skill evidence.                             |
| `image`             | `@brains/image-plugin`    | default, full | default     | —           | Uploaded or generated image assets.                                              |
| `site-info`         | `@brains/site-info`       | default, full | default     | default     | Singleton site metadata and CTA settings.                                        |
| `site-content`      | `@brains/site-content`    | —             | default     | default     | Route/section content blocks for configurable sites.                             |
| `doc`               | `@brains/doc`             | —             | full        | —           | Documentation pages for full Relay knowledge hubs.                               |
| `post`              | `@brains/blog`            | default, full | —           | —           | Blog posts.                                                                      |
| `series`            | `@brains/series`          | default, full | —           | —           | Blog/content series pages.                                                       |
| `deck`              | `@brains/decks`           | default, full | full        | —           | Presentation decks.                                                              |
| `project`           | `@brains/portfolio`       | full          | —           | —           | Portfolio/case-study projects.                                                   |
| `social-post`       | `@brains/social-media`    | full          | —           | default     | Social publishing drafts and history.                                            |
| `newsletter`        | `@brains/newsletter`      | full          | —           | —           | Newsletter drafts, schedules, and send records.                                  |
| `product`           | `@brains/products`        | —             | —           | default     | Product detail pages.                                                            |
| `products-overview` | `@brains/products`        | —             | —           | default     | Products landing/overview page.                                                  |
| `summary`           | `@brains/summary`         | —             | all presets | —           | Conversation summaries for Relay team memory.                                    |

`all presets` means the entity type is available in every preset currently declared by that model. A type marked `opt-in` is registered as a capability but is not included in the model's preset list by default.

## Common authoring surfaces

You can create and update entities through several paths:

- chat or MCP clients using `system_create`, `system_update`, `system_delete`, `system_get`, `system_list`, `system_search`, `system_extract`, and `system_insights`
- the generated CMS when the CMS plugin is active
- direct edits to markdown files in `brain-data/` when `directory-sync` is active
- generation jobs owned by entity plugins, for example link capture, image generation, newsletter generation, and social-post generation

## Identity entities

### `brain-character`

Singleton file: `brain-data/brain-character/brain-character.md`

Defines the brain's display identity and behavioral center of gravity.

Key fields:

- `name`
- `role`
- `purpose`
- `values`

### `anchor-profile`

Singleton file: `brain-data/anchor-profile/anchor-profile.md`

Defines the public identity behind the brain. A2A and site surfaces can use this as profile data.

Key fields:

- `name`
- `kind`: `professional`, `team`, or `collective`
- `organization`
- `description`
- `avatar`
- `website`
- `email`
- `socialLinks`

## Core knowledge entities

### `base` — notes

Root-level markdown files in `brain-data/` become note entities.

Example paths:

```text
brain-data/README.md          # id: README, entityType: base
brain-data/research/idea.md   # id: research:idea, entityType: base
```

Key frontmatter:

- `title` optional; falls back to the first H1 or filename

Use notes for general knowledge, imported markdown, scratch material, and content that does not need a specialized workflow.

### `prompt`

Prompt entities customize named generation templates.

Example path:

```text
brain-data/prompt/blog-generation.md
```

Key frontmatter:

- `title`
- `target`: template name, such as `blog:generation` or `link:extraction`

### `link`

Link entities store captured web URLs and their extracted summaries.

Example path:

```text
brain-data/link/example-com-article.md
```

Key frontmatter:

- `status`: `pending`, `draft`, or `published`
- `title`
- `url`
- `description`
- `domain`
- `capturedAt`
- `source`: `{ ref, label }`

Creating a link with `system_create` and a `url` can enqueue the link-capture workflow instead of requiring hand-written frontmatter.

### `wish`

Wish entities capture requested capabilities or deferred user intents.

Key frontmatter:

- `title`
- `status`: `new`, `planned`, `in-progress`, `done`, or `declined`
- `priority`: `low`, `medium`, `high`, or `critical`
- `requested`: count of repeated requests
- `declinedReason`

## Derived knowledge entities

### `topic`

Topic entities are usually derived from published/source content. Rover extracts topics from posts, decks, projects, links, and the anchor profile by default. Relay extracts topics from its source corpus.

Key frontmatter/body:

- frontmatter `title`
- body `content`
- metadata `aliases` for canonicalization and merge reuse

### `skill`

Skill entities are derived from topic evidence and advertised through agent/A2A surfaces.

Key fields follow the shared skill data shape used by the plugin system.

### `swot`

SWOT entities are derived assessment outputs.

Key frontmatter:

- `strengths`
- `weaknesses`
- `opportunities`
- `threats`
- `derivedAt`

Each SWOT item has a `title` and optional `detail`.

### `summary`

Summary entities store conversation summaries when the summary plugin is enabled.

Key metadata:

- `conversationId`
- `channelName`
- `channelId`
- `interfaceType`
- `entryCount`
- `totalMessages`

The body contains chronological summary log entries.

## Publishing entities

### `site-info`

Singleton file: `brain-data/site-info/site-info.md`

Defines site-wide metadata.

Key body fields:

- `title`
- `description`
- `copyright`
- `logo`
- `themeMode`: `light` or `dark`
- `cta`: `{ heading, buttonText, buttonLink }`

### `site-content`

Route/section content used by configurable site packages.

Example path:

```text
brain-data/site-content/home/hero.md # id: home:hero
```

Key metadata:

- `routeId`
- `sectionId`
- optional `template`

### `doc`

Doc entities render documentation list/detail pages.

Key frontmatter:

- `title`
- `section`
- `order`
- `sourcePath`
- `description`
- `slug`

The body contains the documentation markdown.

### `image`

Image entities store binary image assets as data URLs in the database and as image files in `brain-data/image/` when synced.

Key metadata:

- `title`
- `alt`
- `format`: `png`, `jpg`, `jpeg`, `webp`, `gif`, or `svg`
- `width`
- `height`
- `sourceUrl`

Images are non-embeddable and are commonly referenced by `coverImageId` fields on posts, decks, projects, and social posts.

## Content and marketing entities

### `post`

Blog post entities render through the blog/site packages.

Key frontmatter:

- `title`
- `slug`
- `status`: `draft`, `queued`, or `published`
- `publishedAt`
- `excerpt`
- `author`
- `coverImageId`
- `seriesName`
- `seriesIndex`
- SEO fields: `ogImage`, `ogDescription`, `twitterCard`, `canonicalUrl`

### `series`

Series entities group related posts/content.

Key frontmatter/body:

- `title`
- `slug`
- `coverImageId`
- body `description`

### `deck`

Deck entities store presentation content.

Key frontmatter:

- `title`
- `slug`
- `description`
- `author`
- `status`: `draft`, `queued`, or `published`
- `publishedAt`
- `event`
- `coverImageId`

### `project`

Project entities power portfolio or case-study pages.

Key frontmatter:

- `title`
- `slug`
- `status`: `draft` or `published`
- `publishedAt`
- `description`
- `year`
- `coverImageId`
- `url`

Structured body sections:

- `context`
- `problem`
- `solution`
- `outcome`

### `social-post`

Social post entities store platform-ready post drafts and publishing results.

Key frontmatter:

- `title`
- `platform`: currently `linkedin`
- `status`: `draft`, `queued`, `published`, or `failed`
- `coverImageId`
- `publishedAt`
- `platformPostId`
- `sourceEntityId`
- `sourceEntityType`: `post` or `deck`

### `newsletter`

Newsletter entities store email drafts and delivery metadata.

Key frontmatter:

- `subject`
- `status`: `draft`, `queued`, `published`, or `failed`
- `entityIds`
- `scheduledFor`
- `sentAt`
- `buttondownId`
- `sourceEntityType`

## Product entities

### `products-overview`

Singleton-ish overview content for Ranger-style product pages.

Key frontmatter:

- `headline`
- `tagline`

Structured body sections:

- `vision`
- `pillars`
- `approach`
- `productsIntro`
- `technologies`
- `benefits`
- `cta`

### `product`

Product detail pages.

Key frontmatter:

- `name`
- `availability`: `available`, `early access`, `coming soon`, or `planned`
- `order`

Structured body sections:

- `tagline`
- `promise`
- `role`
- `purpose`
- `audience`
- `values`
- `features`
- `story`

## Agent directory entities

### `agent`

Agent entities are saved peer-brain contacts. They are created from A2A agent cards and can be discovered or explicitly approved.

Key frontmatter:

- `name`
- `kind`
- `organization`
- `brainName`
- `url`
- `did`
- `status`: `discovered` or `approved`
- `discoveredAt`

Parsed body sections include:

- `about`
- `skills`
- `notes`

URL-based creation through `system_create` can fetch the agent card and create an approved saved agent entry.
