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

| Entity type                          | Registered by                        | Selection    | Notes                                                      |
| ------------------------------------ | ------------------------------------ | ------------ | ---------------------------------------------------------- |
| `anchor-profile`                     | identity service + `@brains/profile` | `core`       | Singleton person, team, or organization profile.           |
| `brain-character`                    | identity service                     | `core`       | Singleton persona/instructions source.                     |
| `style-guide`                        | `@brains/style-guide`                | `core`       | Messaging, voice, and visual generation guidance.          |
| `note`                               | `@brains/note`                       | `core`       | Root-level notes and general markdown knowledge.           |
| `refined-note`                       | `@brains/refined-note`               | `core`       | Worked-out notes written from notes, which they replace.   |
| `prompt`                             | `@brains/prompt`                     | `core`       | Prompt/template overrides.                                 |
| `conflict`                           | `@brains/conflict`                   | `core`       | An edit that lost to a newer version, kept for the Inbox.  |
| `link`                               | `@brains/link`                       | `core`       | Captured links and extracted summaries.                    |
| `wish`                               | `@brains/wishlist`                   | `core`       | User requests and roadmap wishes.                          |
| `topic`                              | `@brains/topics`                     | `core`       | Derived topic clusters.                                    |
| `agent`, `skill`                     | `@brains/agent-discovery`            | `core`       | Peer contacts and advertised skills.                       |
| `swot`                               | `@brains/assessment`                 | `core`       | Assessment output from capability evidence.                |
| `image`                              | `@brains/image-plugin`               | `core`       | Uploaded or generated images.                              |
| `document`                           | `@brains/document-plugin`            | `core`       | Generated documents and durable attachments.               |
| `deck`                               | `@brains/decks`                      | `core`       | Presentation decks.                                        |
| `site-info`                          | `@brains/site-info`                  | `site`       | Singleton site metadata and CTA settings.                  |
| `site-content`                       | `@brains/site-content`               | `site`       | Route/section content blocks.                              |
| `post`                               | `@brains/blog`                       | `publishing` | Blog posts.                                                |
| `series`                             | `@brains/series`                     | `publishing` | Blog/content series pages.                                 |
| `project`                            | `@brains/portfolio`                  | `publishing` | Portfolio/case-study projects.                             |
| `social-post`                        | `@brains/social-media`               | `publishing` | Social publishing drafts and history.                      |
| `newsletter`                         | `@brains/newsletter`                 | `publishing` | Newsletter drafts, schedules, and send records.            |
| `doc`                                | `@brains/doc`                        | `team`       | Team documentation pages.                                  |
| `summary`, `decision`, `action-item` | `@brains/conversation-memory`        | `team`       | Team memory projections and first-class decisions/actions. |
| `faq`                                | `@brains/faq`                        | `chat`       | Draft FAQs captured from chats at the turn's visibility.   |

The table describes built-in defaults. `add` and `remove` can adjust individual members; removing a member also removes its attached config and policy contributions.

## Common authoring surfaces

You can create and update entities through several paths:

- chat or MCP clients using `system_create`, `system_update`, `system_delete`, `system_get`, `system_list`, `system_search`, and `system_analytics`
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

### `refined-note` — refined notes

A refined note is one worked-out note written from one or more notes. Saving it removes the notes it was written from, so the root empties over time and `brain-data/refined-note/` holds the organized set.

Example path:

```text
brain-data/refined-note/push-beats-pull.md
```

Key frontmatter:

- `title` required
- `summary` required; one sentence saying what the note is
- a value in at least one grouping, such as `projects: [Lighthouse]`, where a grouping applies to refined notes; the brain chooses it when it refines

Refine a note with `system_generate`: operation `prompt-from-source`, `entityType: "refined-note"` and the note as `source`; name further notes in `additionalSourceIds` to refine several into one. `prompt` is optional and gives the writing a direction. The confirmation names every note and says they will be removed; a caller who may not delete notes is refused. A refined note keeps no reference to the notes it came from and cannot be refined again.

### `prompt`

Prompt entities customize named generation templates.

Example path:

```text
brain-data/prompt/blog-generation.md
```

Key frontmatter:

- `title`
- `target`: template registry key, such as `blog:generation` or `link:extraction`
- `defaultHash`: hash of the default body the copy was written from; written by the brain, not by hand

At startup the brain writes a copy of every template default that has none, and keeps copies in step with their defaults:

- a copy whose body still matches `defaultHash` is untouched and is replaced when its default changes;
- an edited copy is kept, and logged once its default has changed;
- a copy without `defaultHash` that equals the current default is stamped; one that differs is kept and logged as an unverified override.

Delete a prompt to reset it: the current default is written back on the next start. Edits apply to the next generation without a restart.

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
- `series`: the one series the post is in, as a list of one name. Its place in the series is not stored: published posts come by when they were published, drafts after.
- SEO fields: `ogImage`, `canonicalUrl`

### `series`

Series entities group related posts/content. A type joins a series by declaring a `series` field, a list of names, in its own frontmatter; Studio shows the built-in Series group for it.

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

Newsletter entities store email drafts and delivery metadata. The entity type is defined by the compound `@brains/newsletter` package (`plugins/newsletter`) alongside generation and selectable Buttondown or Resend delivery workflows. Resend delivery uses Contacts assigned to a configured Segment and sends through Broadcasts.

Key frontmatter:

- `subject`
- `status`: `generating`, `draft`, `queued`, `published`, or `failed`
- `entityIds`
- `scheduledFor`
- `sentAt`
- `sourceEntityType`

A brain selects at most one delivery provider. Resend configuration requires an API key, a Segment ID, and a verified sender; Buttondown configuration may enable its native double opt-in behavior. With no provider configured, newsletter drafts and generation remain available while subscriber tools, signup UI, and external publishing stay disabled.

```ts
newsletter({
  provider: {
    type: "resend",
    apiKey: "${RESEND_API_KEY}",
    segmentId: "${RESEND_NEWSLETTER_SEGMENT_ID}",
    from: "Newsletter <newsletter@example.com>",
    replyTo: "hello@example.com", // optional
    topicId: "${RESEND_NEWSLETTER_TOPIC_ID}", // optional
  },
});
```

Use `type: "buttondown"` with `apiKey` and optional `doubleOptIn` for Buttondown. The previous flat `{ apiKey, doubleOptIn }` newsletter configuration is not accepted.

## Private operational entities

### `contact-request`

`contact-request` records are created only by the explicitly added `@brains/contact` capability, from its contact form or another form that targets them. They are always `restricted`, excluded from embeddings, full-text search, and projection inputs, and shown only through the Admin-only contact Inbox source. Submitted name, email, and message stay in the Markdown body/frontmatter rather than query metadata. Requests are kept until the owner deletes them.

Key frontmatter:

- `name`
- `email`
- `receivedAt`
- `status` (`new` or `handled`)
- `notification` (`pending`, `sent`, or `failed`)

A request written before requests were kept, with an `expiresAt`, is still read; the field is never written again. Startup and recurring maintenance re-enqueue pending notification jobs and delete nothing.

### `quiz-result`

`quiz-result` records are created only by the explicitly added `@brains/quiz` capability, one for each quiz taken. They are always `restricted` and excluded from embeddings, full-text search, and projection inputs. Each says what was asked and answered and which results were shown, so a later edit to its quiz never changes it, and is filed under its quiz (`<quiz>:<key>`). It is an Inbox to-do only when its taker left an email.

Key frontmatter:

- `quiz`, `language` (when taken in a translation), `receivedAt`
- `results` (`dimension`, `title`, `outcome`, `outcomeTitle`)
- `answers` (`field`, `label`, `value`)
- `name`, `email` (when given)
- `status` (`new` or `handled`)
- `notification` (`pending`, `sent`, `failed`, or `none`)

### `reference`

`reference` records belong to `@brains/reference`, in the `federation` bundle. Each points to an entity another brain publishes that has a page on its author's site: a post, deck, project, series, link, note, topic, social post, newsletter, doc, guide or book. It holds what a reader is shown and where the entity lives, never its content. It has no body of its own and is stored as a YAML file.

A reference is created from the entity's address on its author's brain, with `system_create` and `source: { kind: "url", url }`. The capture finds the author's AT Protocol repo, reads the record whose `canonicalUrl` is that address, and writes a draft. Publishing the draft features it. A daily check keeps the fields and byline current and marks the entry `withdrawn` when the author's record is gone.

Key frontmatter:

- `status`: `draft` or `published`
- `title`, `summary`, `series` (the author's own words)
- `author` (the anchor name on the author's brain card), `authorSite`
- `url`, `publishedAt`
- `sourceState`: `active` or `withdrawn`
- `sourceUri` (the record's `at://` URI), `sourceEntityType`, `sourceEntityId`, `sourceBrain`

A site shows the selection with the `references:list` template on the `references:entities` data source.

## Site forms

### `form`

A `form` entity (`@brains/form`, in the `site` bundle) defines a public form on the brain's site: its frontmatter is the definition (`target`, `path`, copy, `steps` of fields, optional `scoring`, `notify`, `limits`, `translations`), its body the intro, and its id the form's. The package that owns the target type serves it; a form with a built-in form's id rewords that form. A definition the engine would not run is refused on persist. Forms are never knowledge or model input. See `shared/forms/README.md`.

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
