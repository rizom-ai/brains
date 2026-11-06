# Plan: Moving-in guides

## Status

Proposed. The doc-brain holds only reference docs (`doc` entities). Nothing tells a new user how their existing material and habits carry over into a brain. This plan adds guides: one per kind of user and one for running your own brain, as their own entity type in the doc-brain, rendered as designed walkthroughs rather than reading pages. The writer guide is drafted in [../moving-in-guides-mockups.html](../moving-in-guides-mockups.html).

## Behavior

- The doc-brain serves `/guides`, an index of five guides, and `/guides/<slug>` for each: **writer**, **researcher**, **consultant**, **team** and **self-hosting** ("Running your own brain").
- A guide addresses a kind of user, not a platform. It opens with who it is for, shows the material that person already has and what each part becomes in the brain, names the recipe to start from, and walks through the stages of moving in up to what the brain does for them after a week.
- Guides do not depend on where the brain runs. The four user guides start from the brain's welcome email (chat, Studio, AI tools) and use only routes that work on any brain: uploads and requests in chat, Studio, and connected AI tools. Their start section links to the self-hosting guide for anyone running the brain themselves.
- The self-hosting guide covers what only an operator does: installing, choosing a recipe, the sync folder and content repository, and deploying. It names no kind of user and no recipe.
- Platforms appear only as steps inside a stage ("Google Docs: File → Download → Markdown").
- Each stage links to the docs that hold the exact steps. Guides never restate reference material.
- A guide describes only routes that work on a released brain. Every step of a user guide is run on a hosted brain set up from the guide's recipe, and every step of the self-hosting guide on a fresh install, before the guide is synced.
- Guides are entities in the doc-brain, so its agent finds them: asked "I'm a writer with drafts in Google Docs, where do I start?", it answers from the writer guide and links to it.
- The docs header gets a **Guides** link; the docs home gets a "Moving in" band above the sections that links to the five guides.

## Current state

- **Docs.** `@brains/doc` (`entities/doc`) defines `doc` with `title`, `section`, `order`, `description`, `slug`. `@rizom/site-docs` routes `/` and `/docs` to `docs:doc-list` and displays each doc at `/docs/<slug>`. The chrome (`DocsPageShell`, header, footer, `--docs-*` tokens) lives in `entities/doc/src/templates/docs-design.tsx` and `docs-components.tsx`.
- **Sync.** `docs/docs-manifest.yaml` lists doc sources. On each core release, `scripts/sync-docs-content.ts` writes them as `doc/<id>.md` into `rizom-ai/doc-brain-content`, rewriting repo links to `/docs/<id>` or GitHub. It copies markdown only; no docs carry images.
- **Writer routes that exist today.** Directory-sync imports markdown from the sync folder: a root `.md` becomes a `note` (frontmatter optional, title from the first heading), a file under `post/` becomes a post only with full frontmatter (`title`, `status`, `excerpt`, `author`). Chat and web chat accept `.md`/`.txt` uploads. Blog generation accepts supplied `title` and `content` and can skip the AI pass. Posts carry `publishedAt` and `canonicalUrl`. The style guide sets generation voice. Recipes: `headless`, `personal`, `professional`, `team`; `professional` brings the site and the publishing bundle.
- **Hosted start.** A brain sends a personal welcome email linking to chat, Studio and the Account → AI tools tab (`shell/auth-service/src/onboarding-emails.ts`); sign-in is by passkey. Hosted users have no access to the sync folder; Studio clone access to the content repository is planned in [artifacts-content-repos.md](./artifacts-content-repos.md), not shipped.
- **Writer routes that do not exist.** No importer for Google Docs, Substack, Medium, WordPress or RSS; no `.docx` import; Studio uploads only images and PDFs. Guides do not promise these, and an importer is not part of this plan.

## Design

### The `guide` entity

A new package `@brains/guide` (`entities/guide`) with a `guides` plugin and entity type `guide`. Frontmatter:

| Field      | Type                                         | Purpose                                                       |
| ---------- | -------------------------------------------- | ------------------------------------------------------------- |
| `title`    | string                                       | "Moving in as a writer"                                       |
| `slug`     | string                                       | URL segment and sync id                                       |
| `order`    | int                                          | Position on the index                                         |
| `persona`  | string                                       | Short name on cards ("The writer")                            |
| `for`      | string                                       | One sentence describing the reader                            |
| `recipe`   | `personal \| professional \| team`, optional | Recipe the guide starts from; the self-hosting guide has none |
| `brings`   | `string[]`, optional                         | What the start section lists; absent, the recipe's own lines  |
| `material` | `{ from, where, becomes, how }[]`            | What the reader has and the entity type each part becomes     |

The body is markdown. Each `##` heading is a stage; the stage's text runs to the next heading. A stage ends with an `Exact steps:` line listing the docs it relies on; the template shows those links as "Exact steps" links and drops the line from the prose. The last stage is what the brain does after a week. `becomes` is an entity type name (`note`, `post`, `link`, `series`, `deck`, …) so the material map can label it the way Studio does.

Metadata carries every frontmatter field, since the index card shows all of them; types are `z.output` of the schemas. The plugin mirrors `DocsPlugin`: adapter, data source `guides:entities` (list, and detail with the other guides for the closing links), templates `guide-list` and `guide-detail`.

### Rendering

Guide templates reuse the docs chrome (`DocsPageShell`, header, footer, `docsClasses`, the `--docs-*` styles) from `@brains/docs-chrome` (`shared/docs-chrome`), which `@brains/doc` uses too; entity packages do not import each other. Only the page body is new:

- **Opening:** persona label, title, the `for` sentence, and the material as scattered fragments that settle into one light as the reader scrolls.
- **Material map:** the reader's places on the left, entity types on the right, joined by curves; the `how` line under each source.
- **Start:** when the guide names a recipe, what it brings (the guide's `brings`, or the recipe's own lines), the welcome email with its three doors (chat, Studio, AI tools), and a link to the self-hosting guide. The self-hosting guide has no start section; installing is its first stage.
- **Stages:** numbered chapters with a sticky rail; each stage shows its markdown and the docs it links to as "Exact steps" links.
- **Closing:** the other four guides.

Visuals are drawn from guide data by the templates. No image files, so the sync stays markdown-only.

### Sources and sync

- Sources live in `docs/guides/<slug>.md` with their full frontmatter.
- `docs/docs-manifest.yaml` gains a `guides` list (`id`, `source`). `check-docs-manifest` validates it like `docs`.
- `sync-docs-content.ts` parses each guide source with the `guide` frontmatter schema, rewrites links (doc sources → `/docs/<id>`, guide sources → `/guides/<id>`, other repo paths → GitHub), writes `guide/<id>.md`, removes stale files, and checks both folders under `--check`.
- The release workflow stages `doc` and `guide`.

### Registration

`guides` joins the canonical brain next to `docs`, outside every bundle, and ships in `@rizom/brain`; a brain enables it with `add: [guides]`, as it does `docs`. `@rizom/site-docs` adds the `/guides` route, `entityDisplay.guide` (`/guides/<slug>`), the Guides header link and the docs-home band. The band is the `guides:guide-band` template, which the docs home routes set between `docs:doc-home-hero` and `docs:doc-home-sections`, the two parts of the docs home; `docs:doc-list` stays the whole page for sites that show docs without composing them. The doc-brain adds `guides` to its plugins with the next fleet pin.

## Phases

One PR; each phase is a commit with its tests.

1. **Walking skeleton.** `@brains/guide` with schema, adapter, data source and a plain `guide-detail` (docs chrome, markdown body); `guides` in the canonical brain; `/guides/<slug>` on the docs site; manifest `guides` list and sync of `docs/guides/writer.md`. Tests: frontmatter schema, adapter round trip, sync output and `--check` for guides, route registration.
2. **Writer guide, designed.** Opening, material map, start, staged chapters and rail, as in the mockup. The writer guide's steps are run on a hosted `professional` brain and corrected before commit. Template tests over a fixture guide.
3. **Index and entry points.** `guide-list` at `/guides`, the Guides header link, the docs-home band.
4. **Researcher, consultant, team, self-hosting.** One commit per guide. Each user guide is run on a hosted brain from its recipe (`personal`, `professional`, `team`); the self-hosting guide on a fresh install from the published `@rizom/brain`.
5. **Ask.** A doc-brain eval, the `docs` suite in `packages/brain-cli/brain.eval.yaml` on the docs site: persona-shaped questions are answered from the matching guide and cite it at `/guides/<slug>`; a reference question cites a doc and no guide.

Changesets: `@brains/guide` and `@rizom/brain` in the core lane, `@rizom/site-docs` in the site lane. The doc-brain pin moves after both releases.
