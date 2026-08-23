# Entity Types Reference

`brains` stores durable knowledge as typed markdown entities. Each entity type is registered by an entity plugin, validated with Zod, indexed for search, exposed through system tools, and optionally rendered by the site builder.

## Storage conventions

Directory sync maps files in `brain-data/` to entities by path:

- root markdown files are note entities with `entityType: "note"`
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

## Bundle availability

| Entity type                          | Registered by                        | Selection         | Notes                                                      |
| ------------------------------------ | ------------------------------------ | ----------------- | ---------------------------------------------------------- |
| `anchor-profile`                     | identity service + `@brains/profile` | `core`            | Singleton person, team, or organization profile.           |
| `brain-character`                    | identity service                     | `core`            | Singleton persona/instructions source.                     |
| `style-guide`                        | `@brains/style-guide`                | `core`            | Messaging, voice, and visual generation guidance.          |
| `note`                               | `@brains/note`                       | `core`            | Root-level notes and general markdown knowledge.           |
| `prompt`                             | `@brains/prompt`                     | `core`            | Prompt/template overrides.                                 |
| `link`                               | `@brains/link`                       | `core`            | Captured links and extracted summaries.                    |
| `wish`                               | `@brains/wishlist`                   | `core`            | User requests and roadmap wishes.                          |
| `topic`                              | `@brains/topics`                     | `core`            | Derived topic clusters.                                    |
| `agent`, `skill`                     | `@brains/agent-discovery`            | `core`            | Peer contacts and advertised skills.                       |
| `swot`                               | `@brains/assessment`                 | `core`            | Assessment output from capability evidence.                |
| `image`                              | `@brains/image-plugin`               | `core`            | Uploaded or generated images.                              |
| `document`                           | `@brains/document-plugin`            | `core`            | Generated documents and durable attachments.               |
| `deck`                               | `@brains/decks`                      | `core`            | Presentation decks.                                        |
| `site-info`                          | `@brains/site-info`                  | `site`            | Singleton site metadata and CTA settings.                  |
| `site-content`                       | `@brains/site-content`               | `site`            | Route/section content blocks.                              |
| `post`                               | `@brains/blog`                       | `publishing`      | Blog posts.                                                |
| `series`                             | `@brains/series`                     | `publishing`      | Blog/content series pages.                                 |
| `project`                            | `@brains/portfolio`                  | `publishing`      | Portfolio/case-study projects.                             |
| `social-post`                        | `@brains/social-media`               | `publishing`      | Social publishing drafts and history.                      |
| `newsletter`                         | `@brains/newsletter`                 | `publishing`      | Newsletter drafts, schedules, and send records.            |
| `doc`                                | `@brains/doc`                        | `team`            | Team documentation pages.                                  |
| `summary`, `decision`, `action-item` | `@brains/conversation-memory`        | `team`            | Team memory projections and first-class decisions/actions. |
| `product`, `products-overview`       | `@brains/products`                   | `add: [products]` | Commerce detail and overview content.                      |

The table describes built-in defaults. `add` and `remove` can adjust individual members; removing a member also removes its attached config and policy contributions.

## Common authoring surfaces

You can create and update entities through several paths:

- chat or MCP clients using `system_create`, `system_update`, `system_delete`, `system_get`, `system_list`, `system_search`, and `system_insights`
- the generated Studio when the Studio plugin is active
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
- `kind`: `person`, `team`, or `organization`
- `organization`
- `description`
- `avatar`
- `website`
- `email`
- `socialLinks`

The optional `@brains/profile` capability adds kind-aware fields:

- person/professional: `tagline`, `intro`, `role`, `audience`, `expertise`, `currentFocus`, `availability`
- team: `tagline`, `intro`, `purpose`, `audience`, `focusAreas`, `capabilities`, `workingPrinciples`
- organization: `tagline`, `intro`, `mission`, `audience`, `focusAreas`, `offerings`, `values`

The markdown body is the long-form profile story. Tone and visual direction do not belong in the profile.

### `style-guide`

Singleton file: `brain-data/style-guide/style-guide.md`

Defines durable generation guidance independently from represented identity.

Key fields:

- `name`
- `messaging`: audiences and positioning
- `voice`: summary, traits, principles, preferred terms, and avoided language
- `visual`: art direction, palette, composition, mood, preferences, and exclusions

The markdown body can hold examples, rationale, and exceptions. Styled generation selects `voice`, `visual`, or both; neutral extraction and transformation workflows opt out.

## Core knowledge entities

### `note` — notes

Root-level markdown files in `brain-data/` become note entities.

Example paths:

```text
brain-data/README.md          # id: README, entityType: note
brain-data/research/idea.md   # id: research:idea, entityType: note
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

Creating a link with `system_create` and `source: { kind: "url", url }` uses the standard confirmation flow, then can enqueue the link-capture workflow instead of requiring hand-written frontmatter.

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

Topic entities are usually derived from selected source content such as posts, decks, projects, links, and the anchor profile. The exact corpus follows active bundles and members.

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

Summary entities store narrative conversation memory when the conversation-memory plugin is enabled.

Key metadata:

- `conversationId`
- `channelName`
- `channelId`
- `interfaceType`
- `entryCount`
- `messageCount`

The body contains chronological summary log entries.

### `decision`

Decision entities store explicit decisions derived from team conversations.

Key metadata:

- `conversationId`
- `channelId`
- `interfaceType`
- `spaceId`
- `timeRange`
- `sourceSummaryId`
- `sourceMessageCount`
- `status`: `active` or `superseded`

### `action-item`

Action item entities store explicit follow-up work derived from team conversations.

Key metadata:

- `conversationId`
- `channelId`
- `interfaceType`
- `spaceId`
- `timeRange`
- `sourceSummaryId`
- `sourceMessageCount`
- `status`: `open`, `done`, or `dropped`

## Publishing entities

### `site-info`

Singleton file: `brain-data/site-info/site-info.md`

Defines website channel configuration and selects the represented identity. It does not own profile or generation style.

Key body fields:

- `represents`: `brain` or `anchor`; defaults to `anchor`
- `title`: optional override; otherwise derived from the represented identity
- `description`: optional override; otherwise derived from the represented identity
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

### `document`

Document entities store generated PDF assets as data URLs in the database and, when synced, as document files under `brain-data/document/`.

Key metadata:

- `title`
- `mimeType`: currently `application/pdf`
- `filename`
- `pageCount`
- `sourceEntityType`
- `sourceEntityId`
- `attachmentType`, such as `carousel`
- `dedupKey`

Documents are non-embeddable publishable artifacts. A common flow is rendering a deck carousel into a durable PDF document, attaching it to `social-post.documents[]`, and publishing it as a native LinkedIn document/carousel post.

## Content and marketing entities

### `post`

Blog post entities render through the blog/site packages.

Key frontmatter:

- `title`
- `slug`
- `status`: `generating`, `draft`, `queued`, `published`, or `failed`
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
- `status`: `generating`, `draft`, `queued`, `published`, or `failed`
- `publishedAt`
- `event`
- `coverImageId`

### `project`

Project entities power portfolio or case-study pages.

Key frontmatter:

- `title`
- `slug`
- `status`: `generating`, `draft`, `published`, or `failed`
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
- `status`: `generating`, `draft`, `queued`, `published`, or `failed`
- `coverImageId`
- `documents`: array of `{ id }` references to `document` entities for native document/PDF posts
- `publishedAt`
- `platformPostId`
- `sourceEntityId`
- `sourceEntityType`: `post` or `deck`

For LinkedIn, social posts support text-only posts, image posts via `coverImageId`, and native PDF/document posts via `documents[]`.

### `newsletter`

Newsletter entities store email drafts and delivery metadata. The entity type is defined by the compound `@brains/newsletter` package (`plugins/newsletter`) alongside the generation and Buttondown send workflows.

Key frontmatter:

- `subject`
- `status`: `generating`, `draft`, `queued`, `published`, or `failed`
- `entityIds`
- `scheduledFor`
- `sentAt`
- `buttondownId`
- `sourceEntityType`

## Product entities

### `products-overview`

Singleton-ish overview content for commerce product pages.

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

URL-based creation through `system_create` uses the standard confirmation flow, then can fetch the agent card and create an approved saved agent entry.
