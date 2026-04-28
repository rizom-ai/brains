# Docs Site Plan

## Decision

Docs should be first-class brain content.

Use:

- entity type: `doc`
- package: `entities/doc`
- plugin id: `docs`
- routes: `/docs` and `/docs/:slug`

Do **not** create `sites/docs` initially. Docs should render inside the active site/theme when the `docs` capability is enabled.

## Ownership

### `brains` repo owns

- canonical markdown docs
- `docs/docs-manifest.yaml`
- generic `doc` entity plugin
- generic docs route/template rendering
- docs sync/generation script used by release workflows
- release trigger that publishes generated docs content for the release ref

### `rizom-ai/doc-brain-content` owns

The separate docs content repo, `rizom-ai/doc-brain-content`, owns generated docs brain content:

```text
doc/<id>.md
site-content/...
```

`brain-data` remains a normal standalone content checkout and is not committed inside this monorepo.

### docs app repo owns

A separate docs app/brain repo, likely `rizom-ai/doc-brain`, owns:

- `brain.yaml`
- app-local site composition (`src/site.ts`)
- deploy workflow and deploy secrets
- running/rebuilding/deploying `docs.rizom.ai`

The docs app should use the same standalone app/deploy tooling as other deployed brains. Avoid a special in-monorepo deploy path for docs.

### Release publishing flow

On release, this repo should:

1. generate docs entities from `docs/docs-manifest.yaml` for the release commit/ref
2. push generated content to `rizom-ai/doc-brain-content`
3. trigger the docs app repo's normal deploy/rebuild workflow

This keeps docs publishing tied to releases without making docs deployment a monorepo-only snowflake.

## Source manifest

Added:

```text
docs/docs-manifest.yaml
```

Manifest entries should be explicit and stable:

```yaml
docs:
  - id: getting-started
    title: Getting Started
    section: Start here
    order: 10
    source: packages/brain-cli/docs/getting-started.md
  - id: content-management
    title: Content Management
    section: Content and entities
    order: 20
    source: docs/content-management.md
```

The manifest is the source-side contract. It avoids brittle directory scraping.

## Generated doc entities

The source repo provides `scripts/sync-docs-content.ts`:

```bash
bun scripts/sync-docs-content.ts --out <content-checkout>
bun scripts/sync-docs-content.ts --check --out <content-checkout>
```

The docs sync writes into a docs content checkout:

```text
doc/<id>.md
```

At runtime the docs app checks that content repo out as its local `brain-data`.

Each generated file gets normalized frontmatter:

```yaml
---
title: Getting Started
section: Start here
order: 10
sourcePath: packages/brain-cli/docs/getting-started.md
---
```

Body is copied from the source markdown, with links rewritten as needed.

## `doc` entity plugin

Initial package exists at `entities/doc` with schema, adapter, plugin registration, datasource, and index/detail templates.

Current status:

- `/docs` lists and groups docs by section/order
- `/docs/:slug` renders markdown detail pages
- detail pages include grouped sidebar navigation and previous/next links
- Relay docs test app validates the route path with a running docs brain

Remaining responsibilities:

- production `doc-brain-content` sync path and docs-app deploy trigger
- docs search, syntax highlighting, and versioning if/when needed

Suggested frontmatter:

- `title: string`
- `section: string`
- `order: number`
- `sourcePath: string`
- `description?: string`
- `slug?: string`

Suggested derived metadata:

- `title`
- `section`
- `order`
- `slug`

## Routes

When the `docs` capability is active:

- `/docs` lists/group docs by section/order
- `/docs/:slug` renders one doc page

The Relay docs test app also registers an explicit `/docs` route so docs-specific page sections can compose normally. The current `/docs` route contains `docs:doc-list` with doc entity data.

Rizom ecosystem/chrome composition is intentionally out of scope for `entities/doc` for now. Finish the docs content/rendering path first, then reintroduce ecosystem from the Rizom site layer if needed.

## Markdown rendering

First pass should support:

- headings
- paragraphs
- lists
- tables
- fenced code blocks
- inline code
- links

Defer:

- search
- syntax highlighting
- MDX
- versioned docs

## Link rewriting

Sync should rewrite links from manifest source paths to docs routes.

Example:

```text
../packages/brain-cli/docs/getting-started.md -> /docs/getting-started
./content-management.md -> /docs/content-management
```

External links and non-manifest markdown links should remain unchanged or fail sync, depending on strictness.

## Guardrails

- no git submodules
- no runtime cross-repo reads
- no `sites/docs` unless a generic docs entity route is insufficient
- no sync service plugin unless sync must become runtime-managed later
- docs app repo owns deploy/runtime
- `rizom-ai/doc-brain-content` owns generated `brain-data` history
- missing manifest sources fail sync
- generated output must be deterministic

## Relay test apps

Added minimal Relay test apps:

```text
brains/relay/test-apps/core
brains/relay/test-apps/default
brains/relay/test-apps/docs
```

The `docs` test app uses `brain: relay`, `preset: default`, and `add: [docs]`. It has app-local site composition in `src/site.ts` for the docs homepage and `/docs` route.

## Validation

Source repo:

```bash
bun run docs:check
```

`docs:check` validates markdown links, validates `docs/docs-manifest.yaml`, and verifies the committed Relay docs fixture is in sync with the manifest/source docs.

Release/docs publishing:

1. run sync from this repo into a docs content checkout
2. verify generated `doc/*.md`
3. push generated content to `rizom-ai/doc-brain-content`
4. trigger docs app repo deploy/rebuild workflow
5. docs app starts/pulls its `brain-data` content repo
6. trigger preview rebuild on the running app
7. inspect `dist/site-preview`
8. deploy only after preview is correct
