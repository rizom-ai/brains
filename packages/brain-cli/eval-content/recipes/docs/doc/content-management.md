---
title: "Content Management"
section: "Use a brain"
order: 20
slug: "content-management"
description: "Create, edit, sync and publish markdown content"
---

# Content Management Guide

`brains` treats content as typed markdown entities. You can work with those entities through chat/MCP tools, the Studio, direct markdown edits, or plugin-owned generation jobs. The same content graph powers search, agent context, Studio editing, and static-site publishing.

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

- root markdown files are note entities with `entityType: "note"`
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

| Tool               | Purpose                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `system_create`    | Create an entity from existing material. `source.kind` selects the source, and `visibility` sets access (see [Visibility](#visibility)). |
| `system_update`    | Update fields, apply exact text edits, or replace full content. Requires confirmation for writes.                                        |
| `system_delete`    | Delete an entity. Requires confirmation.                                                                                                 |
| `system_get`       | Fetch one entity by id, slug, or title.                                                                                                  |
| `system_list`      | List entities by type, optionally filtered by status.                                                                                    |
| `system_search`    | Search entities. `scope` is required: `{"kind":"all"}` for every type, or `{"kind":"type","entityType":"post"}` for one type.            |
| `system_analytics` | Return aggregate metrics and reports registered by the runtime or plugins.                                                               |

`system_create` takes one `source`, chosen by `kind`:

| `source.kind`    | What it saves                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `text`           | Literal content given in the call.                                                                                           |
| `user-message`   | Text the user already pasted in this conversation, read from the stored message between exact boundaries.                    |
| `url`            | A URL or domain, for URL-backed types such as links and agents.                                                              |
| `upload`         | One file attached in chat, by upload `id`, with `transform: "extract-markdown"` (import its text) or `"preserve"` (keep it). |
| `uploads`        | Two to twenty attached files from one request, under one confirmation (see [Chat uploads](#chat-uploads)).                   |
| `prior-response` | An earlier assistant answer in this conversation.                                                                            |
| `entity`         | An existing entity's text, without its frontmatter, as a new entity of another type ("turn my note X into a post").          |

Examples:

```bash
brain tool system_create '{"entityType":"note","title":"Idea","source":{"kind":"text","content":"# Idea\n\nA short note."}}'
brain tool system_create '{"entityType":"note","visibility":"restricted","source":{"kind":"text","content":"Private operating note."}}'
brain tool system_search '{"query":"recent published posts","scope":{"kind":"type","entityType":"post"}}'
brain tool system_list '{"entityType":"post","status":"draft"}'
```

`system_update` takes exactly one typed `operation`: `fields`, `edits`, `content`, or `source`. Use the `fields` operation for frontmatter/metadata changes:

```bash
brain tool system_update '{
  "entityType":"post",
  "id":"my-first-post",
  "operation":{"fields":{"title":"A revised title"}}
}'
```

For small content changes, fetch the entity first and use the `edits` operation rather than regenerating the whole Markdown document:

```bash
brain tool system_update '{
  "entityType":"note",
  "id":"working-plan",
  "operation":{"edits":[{"oldText":"Review cadence: monthly.","newText":"Review cadence: weekly."}]}
}'
```

Each `oldText` must occur exactly once in the original content. Up to 50 non-overlapping edits can be proposed together; an empty `newText` deletes the matched text. All edits are checked before any is applied, and unchanged text is not regenerated. Ambiguous, missing, or overlapping matches are rejected.

Use the `content` operation only for intentional whole-document replacement; text without frontmatter replaces the body and keeps the stored frontmatter. Use the `source` operation to replace content with text the user supplied in a conversation message, selected by exact boundaries. Flat `fields`, `edits`, or `content` arguments, unknown arguments, and mixed operations are rejected. Source-derived metadata is refreshed when its source changes, including a note title derived from an edited heading.

The initial call proposes changes without writing them. Approve through the confirmation flow; stale or altered approvals are rejected. Basic MCP clients continue to use agent-backed `chat` and `confirm`, not direct mutation tools.

### Create from your own text

When you paste your own text and ask for a post, project, deck, or doc, the text is kept as written and the brain adds only what the type needs around it. If something is missing, the brain asks before the single approval, and the text you pasted is held while you answer:

- a post asks for a title when the text has none, and its generation adds the excerpt, author, and status;
- a project asks which year it began when the text does not say, and for a one-sentence summary;
- a doc asks which section it goes in, unless the docs have only one section;
- a deck asks where the slides break when the text has no `---` separators and cannot be split at its headings.

Facts you state outside the text go in `fields`, for example `{"status":"published","publishedAt":"2025-03-12","canonicalUrl":"https://example.com/essay"}` for an essay first published elsewhere.

### Chat uploads

Files attached in Studio Chat or a chat platform can be saved as content. Only Trusted and Admin users' attachments reach the brain; public users can chat, but their files are not downloaded.

What each file becomes depends on its type and on whether you ask to import its text or keep the file itself:

| File                         | Imported as text (`extract-markdown`)                          | Kept as a file (`preserve`) |
| ---------------------------- | -------------------------------------------------------------- | --------------------------- |
| Markdown, plain text         | A note, or a post or other type you name, from the file's text | Not available               |
| PDF                          | A note holding the extracted text, up to 5 MB and 50 pages     | A `document` entity         |
| Image (PNG, JPEG, WebP, GIF) | Not available                                                  | An `image` entity           |

A note imported from a file takes its title from the file's first level-1 `#` heading, or from the file name when there is none. A title you state wins over both. Extracted PDF text is flat paragraphs, one per page, with no headings or lists.

An essay can be kept as a post with its original publication facts: name the date and address it was first published at, and they are saved as the post's `publishedAt` and `canonicalUrl`.

Several files attached to one request are saved together. The brain makes one `system_create` call with `source.kind: "uploads"` listing every file (2 to 20), each with its own transform, title, and fields. The confirmation lists every file and what it becomes, and nothing is saved until you approve. Two files that would land on the same entity are refused before the confirmation; a file that fails to save does not stop the others.

When processing a saved file fails, its entry is left with `status: failed`. An Admin who retries it under the same title replaces the failed entry, keeping its id, instead of being refused as a duplicate; the confirmation says which failed entry it replaces.

AI tools connected over MCP, such as Claude Desktop, send text only: the MCP `chat` tool takes a message and no attachments. To save a file from there, paste its text, or attach the file in Studio Chat.

### Studio

When the `studio` plugin is active and the brain serves HTTP, the web surface exposes a Studio for editing configured entity types. Start the brain and open the local web host:

```bash
brain start
# open http://localhost:8080/studio
```

The Studio is most useful for frontmatter-driven content such as posts, decks, projects, site-info, site-content, and newsletters. Exact Studio collections depend on selected bundles, additions/removals, and active entity plugins. See [Studio](/docs/studio) for a tour.

### Direct markdown edits

When `directory-sync` is active, files in `brain-data/` are imported into the entity database and entity changes can be exported back to disk.

Typical workflow:

1. edit markdown under `brain-data/`
2. keep the brain running so file watching can import changes, or run `brain sync` (the `directory_sync` tool)
3. commit content changes if `brain-data/` is backed by git

If `directory-sync.git` is configured, the content directory can sync with a remote content repository:

```yaml
plugins:
  directory-sync:
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
```

For the git-command-oriented lifecycle and conflict policy, see [Directory Sync Git Overview](/docs/directory-sync-git).

`directory-sync` also handles recipe-owned seed content on first run. Seed content is copied only when the target `brain-data/` directory is effectively empty. For local `file://` git remotes, `git.bootstrapFromSeed` defaults to `true` and can create/seed a missing or empty bare remote from `seedContentPath`.

The same files can also be edited through the brain's drive (WebDAV) and Obsidian; see [Drive and Obsidian](/docs/drive-and-obsidian).

### Generation jobs

Some entity types own generation or capture workflows:

- links can be created from a URL and captured/summarized through `system_create`
- images can be preserved from uploads through `system_create` or generated from prompts through `system_generate`
- posts, decks, newsletters, and social posts can be generated from prompts or resolved source entities through `system_generate`
- topics, skills, and SWOT entries are usually derived from existing content

Create and generate requests use the standard confirmation flow before anything is persisted or queued. After confirmation, a generation call may return `{ status: "generating", jobId }` instead of an immediate entity. Check job status through runtime tools or wait for progress in MCP/chat clients.

## Visibility

Every entity has one of three visibilities. As the owner, choose by who should read it:

| Visibility   | Who can read it                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public`     | Everyone, including site visitors, guest chat, and public A2A callers. The default when `visibility` is omitted. Only public content is built into the site. |
| `shared`     | Trusted and Admin callers. Peer brains you trust at `trusted` can also ask for a shared entity and take a signed copy of it.                                 |
| `restricted` | Admin callers only.                                                                                                                                          |

A caller can only write at a visibility they can read, so a Trusted caller cannot create `restricted` content. Visibility is a sibling of `source`; do not add policy frontmatter to exact source text merely to select access. If both are given and they disagree, the create is refused.

Marking an entity `shared` is also how you share it with other brains. A trusted peer asks for it by type and id; your brain answers without a model and signs what it serves. The peer keeps it as a read-only `shared-copy` entity, refreshed daily while you keep sharing it and erased to a stub when you stop. See [Agent Discovery](/docs/agent-discovery) for the details.

## Edit conflicts

An entry can be changed in several places at once: Studio, the drive, a file in `brain-data/`, and the content repository. When an edit was made over a version that is no longer the current one, the brain does not save it over the newer version and does not drop it. It keeps the losing edit as a conflict in the Inbox:

| Where the edit came from | What happens                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Studio                   | The save is refused with "This entry changed since it was opened"; your version is kept as a conflict.         |
| Drive (WebDAV)           | The save is accepted by the drive, but kept as a conflict instead of replacing the current version.            |
| File in `brain-data/`    | The file's edit is kept as a conflict, and the file is rewritten with the brain's version.                     |
| Git pull                 | When both sides changed the same lines, the brain's version stays and the remote's text is kept as a conflict. |

Each conflict in the Inbox names the entry and where the edit came from, and shows how it differs from the current version. **Apply this version** replaces the current version with the edit, after a confirmation; **Keep current** dismisses it. The person who made the edit, or an Admin, can resolve it, from the Inbox or from the entry in Studio. An image that changed in both places is not kept as a conflict: the brain's newer image stays, and the file takes it.

## Publishing workflow

Publishing-oriented entities usually use status fields.

| Entity type   | Status values                                          |
| ------------- | ------------------------------------------------------ |
| `post`        | `generating`, `draft`, `queued`, `published`, `failed` |
| `deck`        | `generating`, `draft`, `queued`, `published`, `failed` |
| `project`     | `generating`, `draft`, `published`, `failed`           |
| `link`        | `pending`, `draft`, `published`                        |
| `social-post` | `generating`, `draft`, `queued`, `published`, `failed` |
| `newsletter`  | `generating`, `draft`, `queued`, `published`, `failed` |
| `wish`        | `new`, `planned`, `in-progress`, `done`, `declined`    |

The site builder renders the entities and routes enabled by active bundles/members, the site package, and entity display config. For app/site verification, start the app and trigger a rebuild on the running app before inspecting generated output.

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

For a generated image intended as a cover, use `system_generate` with a nested target reference:

```bash
brain tool system_generate '{
  "operation": {
    "kind": "cover-image",
    "target": { "entityType": "post", "entityId": "cooperative-ai" },
    "prompt": "Abstract cover image for a post about cooperative AI"
  }
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
- [Directory Sync Git Overview](/docs/directory-sync-git)
- [Studio](/docs/studio)
- [Drive and Obsidian](/docs/drive-and-obsidian)
- [Agent Discovery](/docs/agent-discovery)
- [Extensible Entity Model](/docs/entity-model)
- [brain.yaml Reference](/docs/brain-yaml-reference)
- [CLI Reference](/docs/cli-reference)
- [Deployment Guide](/docs/deployment-guide)
