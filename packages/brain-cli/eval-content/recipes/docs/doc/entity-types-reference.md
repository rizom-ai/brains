---
title: "Entity Types Reference"
section: "Use a brain"
order: 30
slug: "entity-types-reference"
description: "The built-in content types and their fields"
---

# Entity Types Reference

`brains` stores durable knowledge as typed markdown entities. Each entity type is registered by an entity plugin, validated with Zod, indexed for search, exposed through system tools, and optionally rendered by the site builder.

## Storage conventions

Directory sync maps files in `brain-data/` to entities by path:

- top-level `.md` files are notes, with `entityType: "note"`; only files directly in `brain-data/` are notes
- every subfolder is read as an entity type: files under `brain-data/<entity-type>/` use the folder name as the entity type, so `brain-data/research/idea.md` is an entity of type `research`, not a note
- nested paths below the entity-type folder become colon-separated ids: `site-content/home/hero.md` becomes entity type `site-content` with id `home:hero`
- a contained type lives in its container's folder: a `book-section` is stored under its book, at `brain-data/book/<book>/<section>.md`
- `form`, `reference`, `traffic-snapshot`, and `grouping-definitions` are stored as `.yaml` files
- images are stored as image files under `brain-data/image/` and documents as `.pdf` files under `brain-data/document/`
- `shared-copy` entities stay in the database and are never written to `brain-data/`

Most content entities use YAML frontmatter plus a markdown body:

```markdown
---
title: My first post
status: draft
---

Markdown body goes here.
```

The header is flat: each key holds a scalar or a list of scalars, so Obsidian shows every key as a property. Structured fields, such as a style guide's voice or a profile's links, are written as `##` sections in the body. The brain still reads files written in the older form, with nested objects in the header, and rewrites them in the current form. See [The stored format](/docs/external-plugin-authoring#the-stored-format).

Core fields such as `id`, `entityType`, `visibility`, `created`, `updated`, and the markdown body are managed by the runtime and adapters. The fields listed below are each type's metadata. Where a file states a field differently, for example as flat keys or as a body section, the section says so.

## Bundle availability

| Entity type                          | Member (package)                                 | Selection     | Notes                                                               |
| ------------------------------------ | ------------------------------------------------ | ------------- | ------------------------------------------------------------------- |
| `brain-character`                    | identity service                                 | always        | Singleton persona and instructions source.                          |
| `anchor-profile`                     | identity service + `profile` (`@brains/profile`) | `core`        | Singleton person, team, or organization profile.                    |
| `prompt`                             | `prompt` (`@brains/prompt`)                      | `core`        | Prompt and template overrides.                                      |
| `conflict`                           | `conflict` (`@brains/conflict`)                  | `core`        | An edit that lost to a newer version, kept for the Inbox.           |
| `style-guide`                        | `style-guide` (`@brains/style-guide`)            | `core`        | Messaging, voice, and visual generation guidance.                   |
| `note`                               | `note` (`@brains/note`)                          | `core`        | Top-level notes and general markdown knowledge.                     |
| `refined-note`                       | `refined-note` (`@brains/refined-note`)          | `core`        | Worked-out notes written from notes, which they replace.            |
| `link`                               | `link` (`@brains/link`)                          | `core`        | Captured links and extracted summaries.                             |
| `topic`                              | `topics` (`@brains/topics`)                      | `core`        | Derived topic clusters.                                             |
| `agent`, `skill`, `shared-copy`      | `agents` (`@brains/agent-discovery`)             | `core`        | Peer contacts, advertised skills, and copies peers share.           |
| `image`                              | `image` (`@brains/image-plugin`)                 | `media`       | Uploaded or generated images.                                       |
| `document`                           | `document` (`@brains/document-plugin`)           | `media`       | Uploaded or rendered PDFs.                                          |
| `playbook`                           | `playbooks` (`@brains/playbooks`)                | `automation`  | Guided workflows the agent runs with the operator.                  |
| `grouping-definitions`               | `studio` (`@brains/studio`)                      | `web`         | Singleton set of admin-authored groupings.                          |
| `ask-content`                        | `ask-content` (`@brains/ask-content`)            | `chat`        | Singleton copy for public Ask surfaces.                             |
| `summary`, `decision`, `action-item` | `conversation-memory`                            | `chat`        | Conversation memory and the decisions and actions captured from it. |
| `faq`                                | `faq` (`@brains/faq`)                            | `chat`        | Draft FAQs captured from chats at the turn's visibility.            |
| `site-info`                          | `site-info` (`@brains/site-info`)                | `site`        | Singleton site metadata and CTA settings.                           |
| `site-content`                       | `site-content` (`@brains/site-content`)          | `site`        | Route and section content blocks.                                   |
| `form`                               | `form` (`@brains/form`)                          | `site`        | Public form definitions.                                            |
| `traffic-snapshot`                   | `analytics` (`@brains/analytics`)                | `site`        | A week of site traffic, restricted.                                 |
| `post`                               | `blog` (`@brains/blog`)                          | `publishing`  | Blog posts.                                                         |
| `series`                             | `series` (`@brains/series`)                      | `publishing`  | Series pages derived from their members.                            |
| `project`                            | `portfolio` (`@brains/portfolio`)                | `publishing`  | Portfolio and case-study projects.                                  |
| `deck`                               | `decks` (`@brains/decks`)                        | `publishing`  | Presentation decks.                                                 |
| `social-post`                        | `social-media` (`@brains/social-media`)          | `publishing`  | Social publishing drafts and history.                               |
| `newsletter`                         | `newsletter` (`@brains/newsletter`)              | `publishing`  | Newsletter drafts, schedules, and send records.                     |
| `reference`                          | `references` (`@brains/reference`)               | `federation`  | Pointers to entities other brains publish.                          |
| `wish`                               | `wishlist` (`@brains/wishlist`)                  | add-only      | Requests for capabilities no installed tool can fulfill.            |
| `swot`                               | `assessment` (`@brains/assessment`)              | add-only      | Assessment output from capability evidence.                         |
| `doc`                                | `docs` (`@brains/doc`)                           | add-only      | Documentation pages. The `team` recipe adds it.                     |
| `guide`                              | `guides` (`@brains/guide`)                       | add-only      | Moving-in guides for one kind of user.                              |
| `book`, `book-section`               | `book` (`@brains/book`)                          | add-only      | Imported books and their sections, read-only.                       |
| `seminar`                            | `seminar` (`@brains/seminar`)                    | add-only      | One question put to approved peers, with their answers.             |
| `contact-request`                    | `contact` (`@brains/contact`)                    | add-only      | Contact form submissions, restricted.                               |
| `quiz-result`                        | `quiz` (`@brains/quiz`)                          | add-only      | One record per quiz taken, restricted.                              |
| `mail-item`                          | `email-workflows` (`@brains/email-workflows`)    | add-only      | Restricted routing summaries of inbound email.                      |
| `email-reply-draft`                  | `@brains/email-workflows`                        | not installed | Declared for the reply-drafting flow; no brain installs it yet.     |

The table describes built-in defaults. Selection names the bundle whose members include the capability. An add-only capability is in no bundle: list its member under `add` in `brain.yaml` to install it. `add` and `remove` adjust individual members; removing a member also removes its attached config and policy contributions. The `team` bundle has no members of its own: it adjusts permissions for members the other bundles bring, and the `team` recipe adds `docs` and `action-board`.

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

The file states `name` and `role` in the header and `purpose` and `values` as body sections.

### `anchor-profile`

Singleton file: `brain-data/anchor-profile/anchor-profile.md`

Defines the public identity behind the brain. A2A and site surfaces can use this as profile data. Whether the anchor is a person, team, or organization is set by `anchor` in `brain.yaml`, not in the profile.

Key fields:

- `name`
- `organization`
- `description`
- `avatar`: URL or asset path to an avatar or logo
- `photo`: a photo of the people behind the anchor, as `![alt](entity://image/<id>)`
- `website`
- `email`
- `socialLinks`: a list of `{ platform, url, label }`, where `platform` is `github`, `instagram`, `linkedin`, `podcast`, `email`, or `website`

The `@brains/profile` capability adds fields for the profile kind that `kind` in `brain.yaml` selects. Every kind has `tagline`, `intro`, and `audience`:

- `professional`: `role`, `expertise`, `currentFocus`, `availability`, `headline`, `industry`, `location`
- `team`: `purpose`, `focusAreas`, `capabilities`, `workingPrinciples`
- `organization`: `mission`, `focusAreas`, `offerings`, `values`

The file states the short facts in the header. `description`, `intro`, `purpose`, `mission`, `currentFocus`, `availability`, `workingPrinciples`, and `socialLinks` are body sections, and the long-form profile story closes the body under `## Story`. Tone and visual direction do not belong in the profile.

### `style-guide`

Singleton file: `brain-data/style-guide/style-guide.md`

Defines durable generation guidance independently from represented identity. The brain writes a neutral default once startup content has settled, and never overwrites a synced or authored guide.

Key fields:

- `name`
- `messaging`: `positioning` and `audiences`
- `voice`: `summary`, `traits`, `principles`, `preferredTerms`, and `avoid`
- `visual`: `artDirection`, `composition`, `mood`, `palette`, `preferred`, and `avoid`

The file states `name` in the header. `messaging`, `voice`, and `visual` are `## Messaging`, `## Voice`, and `## Visual` body sections, each one-line value a labeled line and each list a `###` list. Free-form guidance follows under `## Guidance` and can hold examples, rationale, and exceptions:

```markdown
---
name: Default style guide
---

## Voice

- **Summary:** Clear and direct

### Avoid

- jargon

## Guidance

Quote people as they spoke.
```

Styled generation selects `voice`, `visual`, or both; neutral extraction and transformation workflows opt out.

## Core knowledge entities

### `note` — notes

Top-level markdown files in `brain-data/` become note entities.

Example paths:

```text
brain-data/README.md          # id: README, entityType: note
brain-data/meeting-ideas.md   # id: meeting-ideas, entityType: note
```

A file in a subfolder is not a note: the folder names its entity type.

Key frontmatter:

- `title` optional; falls back to the body's first `#` heading, then its first nonblank line (cut at 80 characters), then `Untitled`
- `status` and `error`: set while a generation writes the note (`generating` or `failed`)

An upload kept as a note (`system_create` with the upload and `transform: "extract-markdown"`) can be a text, JSON, or PDF file. Its title is the title the request gives, else the upload's first level-1 `#` heading, else its file name. A PDF's text is extracted, one paragraph per page, with no heading, list, or table detection; a PDF over 5 MB or 50 pages is refused. To keep a PDF as a file instead, create a `document`.

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

Link entities store captured web URLs and their extracted summaries. The body is the summary.

Example path:

```text
brain-data/link/example-com-article.md
```

Key frontmatter:

- `status`: `pending`, `draft`, or `published`
- `title`
- `url`
- `description`
- `capturedAt`
- `source`: `{ ref, label }`, where the link was captured from; the file states it as `sourceRef` and `sourceLabel`

A link has no `domain` field; readers take the host from `url`.

Creating a link with `system_create` and `source: { kind: "url", url }` uses the standard confirmation flow, then can enqueue the link-capture workflow instead of requiring hand-written frontmatter.

### `wish`

Wish entities record a capability or outcome the brain was asked for and no installed tool could fulfill. The assistant creates one unless the user declines; a repeated request raises `requested`.

Key frontmatter:

- `title`
- `status`: `new`, `planned`, `in-progress`, `done`, or `declined`
- `priority`: `low`, `medium`, `high`, or `critical`
- `requested`: count of repeated requests
- `declinedReason`

### `conflict`

A conflict is an edit made over a newer version of an entity, kept so it is not lost. The brain writes one when an edit from Studio, the drive, a file, or git arrives after the entity changed. Whoever made the edit applies or dismisses it from the editor, or an admin does from the Inbox. Nobody edits a conflict, it is never public, and it stays out of search, embeddings, and projections.

Key frontmatter:

- `targetType`, `targetId`: the entity the edit was for
- `origin`: `studio`, `drive`, `file`, or `git`
- `actor`: the user who made the edit, when known
- `base`: the content hash the edit started from, when recorded
- `current`: the content hash of the version the edit would have replaced
- `edit`: the content hash of the losing text

The body is the losing file exactly as it arrived.

## Derived knowledge entities

### `topic`

Topic entities are derived from the brain's projection sources, such as notes, refined notes, posts, decks, docs, guides, book sections, links, and the anchor profile. The exact corpus follows active bundles and members.

Key frontmatter/body:

- frontmatter `title`
- body `content`

Topic metadata is empty. Aliases used to canonicalize and merge topics are kept in the topic extractor's own store, not on the entity.

### `skill`

Skill entities are capabilities advertised through agent and A2A surfaces. With skill derivation on, the brain derives them from its topics and agents.

Key fields:

- `name`
- `description`
- `tags`
- `examples`

The file states `name` and `tags` in the header and `description` and `examples` as body sections.

### `swot`

SWOT entities are derived assessment outputs.

Key fields:

- `strengths`
- `weaknesses`
- `opportunities`
- `threats`
- `derivedAt`

Each SWOT item has a `title` and optional `detail`. The file states `derivedAt` in the header and the four lists as body sections.

## Conversation entities

`summary`, `decision`, and `action-item` belong to `@brains/conversation-memory`. Their files state a time range as `startedAt` and `endedAt`, and list each person in full in a People section that closes the body.

### `summary`

Summary entities store narrative conversation memory. The brain maintains them from stored messages; nobody creates, edits, or deletes one.

Key metadata:

- `channelId`
- `channelName`
- `interfaceType`
- `timeRange`: `{ start, end }`
- `messageCount`
- `participants`: each with `identity`, `identityAliases`, `displayName`, and `roles`
- `sourceHash`

The body contains chronological summary entries.

### `decision`

Decision entities store explicit decisions recorded from team conversations. The body is a heading and its text.

Key metadata:

- `conversationId`
- `channelId`
- `channelName`
- `interfaceType`
- `timeRange`
- `status`: `active` or `superseded`
- `decidedBy`, `mentionedBy`: lists of people

### `action-item`

Action item entities store follow-up work captured from a conversation, tracked from an Inbox item, or added on the action board. `system_create` cannot create one. The body heading is the item's text.

Key metadata:

- `status`: `open`, `doing`, `blocked`, `done`, or `dropped`; dropped items leave the board
- `origin`: `conversation`, `inbox`, or `board`
- `capturedAt`
- `conversationId`, `channelId`, `channelName`, `interfaceType`: required for a conversation item
- `sourceRef`: `{ sourceId, entityType, entityId }`, the Inbox item an Inbox item came from; the file states it as `sourceRef`, `sourceEntityType`, and `sourceEntityId`
- `assignedTo`: each with `name`, optional `id` and `aliases`
- `requestedBy`: each with `id`, optional `name` and `aliases`
- `dueDate`

### `faq`

FAQ entities are questions the brain answered in chat, captured as drafts at the visibility of the turn that answered them. The owner reviews them from the Inbox and publishes them. FAQs stay out of broad search, so unreviewed answers do not feed new ones.

Key frontmatter:

- `question`
- `status`: `draft` or `published`
- `asked`: how many chat replies asked this question
- `rank`: the owner's place for it on a site, 1 first

The body holds the answer, then `Sources` the answer drew on, then any `Alternative answers` a repeated question received.

## Publishing entities

### `site-info`

Singleton file: `brain-data/site-info/site-info.md`

Defines website channel configuration and selects the represented identity. It does not own profile or generation style.

Key fields:

- `represents`: `brain` or `anchor`; defaults to `anchor`
- `title`: optional override; otherwise derived from the represented identity
- `description`: optional override; otherwise derived from the represented identity
- `copyright`
- `logo`: show the logo instead of the title text in the header
- `themeMode`: `light` or `dark`
- `cta`: `{ heading, subtitle, buttonText, buttonLink }`
- `sections`: per-section blurbs, keyed by section id
- `translations`: title, description, copyright, and CTA per language tag

The file states the CTA as flat `ctaHeading`, `ctaButtonText`, and `ctaButtonLink` header keys. The CTA subtitle, the section blurbs, and the translations are body sections. A file with a nested `cta` header is still read.

### `site-content`

Route and section content used by configurable site packages. The id is `route:section`; the section's template comes from the site's route definition.

Example path:

```text
brain-data/site-content/home/hero.md # id: home:hero
```

The type has no metadata of its own. A frontmatter key a file keeps is kept in its stored document, which a site build reads. `routeId` and `sectionId` are retired: the id carries them.

### `doc`

Doc entities render documentation list and detail pages.

Key frontmatter:

- `title`
- `section`
- `order`
- `description`
- `slug`: optional; derived from the title when the file states none

The body contains the documentation markdown. `sourcePath` is retired.

### `guide`

Guide entities are moving-in guides: how one kind of user, such as a writer, researcher, consultant, or team, brings their material and habits into a brain.

Key fields:

- `title`
- `slug`
- `order`
- `persona`
- `for`: who the guide is for
- `recipe`: `personal`, `professional`, or `team`; unset for a guide that starts from none
- `brings`: what the guide uses from its recipe
- `section`: the docs section the guide is listed with
- `summary`: a short line shown under the persona in a docs listing
- `material`: each source of material, with `from`, `where`, `becomes` (an entity type), and `how`

The file states `for` and `material` as body sections, one `material` heading per source, above the guide's own sections. An unset field is written back unset.

### `book`

Book entities hold a published book's details and contents. An importer writes books as files; the brain never creates, edits, or deletes them. A book's text is in its sections.

Key frontmatter:

- `title`
- `source`: the URL the text came from
- `author`
- `year`
- `kind`: `work`, `nachlass`, `letters`, or `excerpt`
- `edition`
- `license`: `public-domain`, `CC-BY-SA-4.0`, or `CC-BY-NC-ND-4.0`
- `attribution`
- `published`: published in the author's lifetime, including private prints
- `length`: bytes of the book's text, summed over its sections
- `sections`: the number of sections the edition prints
- `continuations`: reading orders of entries that continue the entry before
- `shortTitle`

Only `title` is indexed as metadata; the rest stays in the file.

### `book-section`

Book section entities hold one section of a book, verbatim, cited by its section. A section is stored in its book's folder and is deleted with it.

Example path:

```text
brain-data/book/<book>/<section>.md
```

Key frontmatter:

- `title`
- `book`
- `order`: reading order within the book, from 1
- `section`: the citation unit, such as an aphorism number, `§`, or edition siglum
- `page`
- `headings`: the headings the section stands under, outermost first
- `source`

### `image`

Image entities store images as durable assets. The entity's content is an `asset://sha256/<digest>` reference; the bytes are kept content-addressed in the brain database's asset tables, in 1 MiB chunks, beside the entity row. When synced, each image is written as an image file in `brain-data/image/`. An image is generated (`system_generate` with `standalone-image` or `cover-image`), rendered from another entity's attachment, or promoted from a PNG, JPEG, GIF, or WebP upload. Rows stored inline as `data:` URLs before assets are moved into assets with `brain assets:migrate`.

Key metadata:

- `title`
- `alt`
- `altSource`: `fallback`, `generated`, or `owner`
- `format`: `png`, `jpg`, `jpeg`, `webp`, `gif`, or `svg`
- `mediaType`, `sizeBytes`
- `width`
- `height`
- `status`: `pending`, `draft`, or `failed`; a pending or failed image has no bytes yet
- `processingError`
- `sourceUrl`
- `sourceEntityType`, `sourceEntityId`, `attachmentType`: the entity it was rendered from
- `sourceUploadId`, `sourceFilename`, `sourceMediaType`: the upload it was promoted from

Images are non-embeddable and are commonly referenced by `coverImageId` fields on posts, series, decks, projects, and social posts, and by `ogImageId` on posts, decks, and projects.

### `document`

Document entities store PDFs as durable assets, the same way images do: the content is an `asset://sha256/<digest>` reference and the bytes are in the asset tables. When synced, each document is written as a `.pdf` file in `brain-data/document/`. A document is rendered from another entity's attachment or kept from a PDF upload (`system_create` with `transform: "preserve"`).

Key metadata:

- `title`
- `mimeType`: currently `application/pdf`
- `filename`
- `pageCount`
- `sizeBytes`
- `status`: `pending`, `draft`, or `failed`
- `processingError`
- `sourceEntityType`, `sourceEntityId`
- `sourceUploadId`, `sourceFilename`, `sourceMediaType`
- `attachmentType`, such as `carousel`
- `dedupKey`

Documents are non-embeddable publishable artifacts. A common flow is rendering a deck carousel into a durable PDF document, attaching it to a social post, and publishing it as a native LinkedIn document/carousel post.

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
- `ogImageId`: the image used for social previews
- `series`: the one series the post is in, as a list of one name. Its place in the series is not stored: published posts come by when they were published, drafts after.
- SEO fields: `ogImage`, `canonicalUrl`

### `series`

Series entities group related posts and content. A type joins a series by declaring a `series` field, a list of names, in its own frontmatter; Studio shows the built-in Series group for it. The brain builds each series from its members and writes its description.

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
- `ogImageId`

When creating a deck from text without `---` separators, `slides: headings` or `slides: paragraphs` says where the slides break. The deck stores its slides, not this field.

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
- `ogImageId`
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
- `documents`: array of `{ id }` references to `document` entities for native document/PDF posts; the file states them as `documentIds`, a list of document ids
- `publishedAt`
- `platformPostId`
- `sourceEntityId`
- `sourceEntityType`: `post` or `deck`

For LinkedIn, social posts support text-only posts, image posts via `coverImageId`, and native PDF/document posts via `documents`.

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

## Brain configuration entities

### `playbook`

Playbook entities are guided workflows the agent runs with the operator, such as onboarding. `playbook_manage` reports a run's status, current state, and valid events.

Key frontmatter:

- `title`
- `status`: `draft`, `active`, or `archived`; defaults to `active`
- `audience`: `admin`, `trusted`, or `public`; defaults to `admin`
- `trigger`
- `lifecycle`
- `once`
- `starterText`
- `description`
- `starterPrompt`
- `completionMode`: `agent-confirmed` or `manual`; defaults to `agent-confirmed`

The body defines the workflow: its `purpose`, `operatingRules`, `initialState`, `states` (each with `id`, `title`, `prompt`, `requiredDetails`, `instructions`, `doneWhen`, `provenBy`, and `transitions`), `finalStates`, and `nextPrompts`. A body that is not a valid playbook is refused.

### `grouping-definitions`

Singleton file: `brain-data/grouping-definitions/grouping-definitions.yaml`

Holds the groupings an admin authored in Studio. Only admins create, update, or delete it.

Key fields:

- `groupings`: at most 20, keyed by grouping key, each with `label`, `multiple`, optional `excludeTypes`, and optional allowed `values`

### `ask-content`

Singleton file: `brain-data/ask-content/ask-content.md`

Holds the copy public Ask surfaces share. It is presentation only, never model instructions or access policy, and stays out of embeddings.

Key fields:

- `title`
- `topics`: suggested topics, at most 20
- `topicsHeading`
- `contactLabel`
- `contactNote`
- `mapCaption`
- `refusal`: what a visitor reads when their question is outside what the site's work speaks to
- `faqHeading`

The body is the introduction. The file states `contactNote` and `refusal` as body sections under it.

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

- `quiz`, `quizTitle` (as the taker saw it), `language` (when taken in a translation), `receivedAt`
- `results` (`dimension`, `title`, `outcome`, `outcomeTitle`)
- `answers` (`field`, `label`, `value`)
- `name`, `email` (when given)
- `status` (`new` or `handled`)
- `notification` (`pending`, `sent`, `failed`, or `none`)

The file states `results` and `answers` in the body, under `## Results` and `## Answers`.

### `traffic-snapshot`

A traffic snapshot is one week of site traffic, Monday to Sunday, captured daily from Cloudflare Web Analytics by `@brains/analytics`. Only the capture writes it. It is always `restricted` and stays out of search, embeddings, and projections. It is stored as a YAML file of its days.

Key fields:

- `days`: each with `date`, `pageviews`, `visits`, `estimated` (counts scaled up from a sample), `paths`, `referrers`, `pathReferrers`, and `countries`

Metadata indexes only the week's `title` and its total `pageviews` and `visits`.

### `mail-item`

A mail item is a restricted routing summary of one inbound email, written by `@brains/email-workflows`. The original stays in the mailbox. Metadata indexes only the routing fields, so no address or sender detail is indexed, searched, or embedded.

Key frontmatter:

- `title`
- `category`: `opportunity`, `recruiting`, `work`, `administrative`, or `personal`; unset only on the system fallback
- `priority`: `high`, `normal`, or `low`
- `status`: `new`, `reviewed`, `handled`, or `archived`
- `needsReply`
- `receivedAt`
- `sourceRef`, `threadKey`, `threadOrdinal`, `personId`: where the email is and which thread it belongs to
- `senderLabel`
- `organization`
- `requestedActions`

The body is the summary.

### `email-reply-draft`

An email reply draft is an operator-editable reply the brain wrote to a mail item, without a copy of the source email. `@brains/email-workflows` declares the type for the reply-drafting flow, but no brain installs it yet. It is always `restricted`.

Key frontmatter:

- `mailItemId`
- `revision`
- `status`: `draft` or `sent`
- `sentAt`
- `providerDeliveryId`

## Site forms

### `form`

A `form` entity (`@brains/form`, in the `site` bundle) defines a public form on the brain's site: its frontmatter is the definition (`target`, `path`, copy, `steps` of fields, optional `scoring`, `notify`, `limits`, `translations`), its body the intro, and its id the form's. The package that owns the target type serves it; a form with a built-in form's id rewords that form. A definition the engine would not run is refused on persist. Forms are never knowledge or model input. See `shared/forms/README.md`.

## Network entities

### `agent`

Agent entities are saved peer-brain contacts in the local agent directory. They are created from A2A agent cards.

Key frontmatter:

- `name`
- `kind`: `person`, `team`, or `organization`
- `organization`
- `brainName`
- `url`
- `repoDid`: the peer's ATProto repo DID
- `brainDid`: the peer's ATProto brain DID
- `cardUri`, `cardCid`: the peer's ATProto brain card
- `status`: `discovered`, `approved`, or `archived`
- `discoveredAt`
- `introducedBy`, `hops`: on an agent sighted through a connected peer's directory

Parsed body sections include:

- `about`
- `skills`
- `notes`

`did` is retired; `repoDid` and `brainDid` replace it.

Creating an agent from a URL through `system_create` uses the standard confirmation flow, fetches and verifies the agent card, and saves the agent as `discovered`. `agent_connect` verifies a new domain and saves it as approved. To approve, restore, or archive a saved agent, use `agent_set_standing`. Only approved agents can be called, and production builds publish only approved agents' pages.

### `shared-copy`

A shared copy is a read-only copy of an entity another brain shares with this one, taken with `agent_shared_entities` (`take`) and removed with its `drop`. The brain keeps it current while the owner shares it. A copy is its own type, apart from this brain's own entities: it stays in the database, is never written to `brain-data/`, and never feeds derivation. Attribute what it says to its `sourceBrain`.

Key metadata:

- `title`
- `sourceBrain`: the peer's domain
- `sourceEntityType`, `sourceEntityId`
- `sourceState`: `active` or `withdrawn`
- `sourceContentHash`, `receivedAt`
- `sourceSignedAt`, `sourceKeyId`, `sourceSignature`: the owner's signature, verified when the copy was taken
- `withdrawnAt`
- `sourceHeader`: the owner's document header, as written

The body is the owner's text.

### `seminar`

A seminar is one question put to the brain's approved peers, kept as their exchange. `seminar_hold` holds one; its job writes the seminar and nobody edits it, so each peer's turn is what that peer's brain answered. The owner reads it and an admin publishes it.

Key frontmatter:

- `question`
- `asked`: the date it was asked
- `status`: `draft` or `published`
- `language`: the language the peers were asked to answer in

The body holds the turns in the order they were taken, then the chair's closing. Each turn names its `round` (`opening`, `challenge`, or `rejoinder`), its speaker, whom it addresses, and either its text with the sources it returned or why the peer did not answer.

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
