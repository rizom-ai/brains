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
- generic `doc` entity plugin, if implemented here
- generic docs route/template rendering, if implemented here

### docs site/brain repo owns

- sync script
- deploy workflow
- source repo/ref selection
- generated `brain-data/doc/*.md`
- running/rebuilding/deploying the docs brain

The docs site repo pulls/clones this repo during sync/deploy. This repo does not push docs into the docs site repo.

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

The docs site repo sync writes:

```text
brain-data/doc/<id>.md
```

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

Remaining responsibilities:

- docs navigation/sidebar beyond basic index/detail pages
- route validation in a running docs brain

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

The detail page should include:

- main markdown content
- sidebar grouped by section/order
- previous/next links if easy

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
- docs site repo owns sync/deploy
- missing manifest sources fail sync
- generated output must be deterministic

## Relay test apps

Added minimal Relay test apps:

```text
brains/relay/test-apps/core
brains/relay/test-apps/default
brains/relay/test-apps/docs
```

The `docs` test app uses `brain: relay`, `preset: default`, and `add: [docs]`.

## Validation

Source repo:

```bash
bun run docs:check
```

Docs site repo:

1. run sync
2. verify `brain-data/doc/*.md`
3. start the docs brain
4. trigger preview rebuild on the running app
5. inspect `dist/site-preview`
6. deploy only after preview is correct
