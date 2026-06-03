# Plan: OG Images and Printable PDFs on the Media Rendering Substrate

## Status

In progress follow-up to the generic media/document work.

Implemented in this branch:

- `post/printable`, `project/printable`, and `product/printable` PDF attachment providers
- durable printable PDFs through `system_create({ entityType: "document", from: { ..., attachmentType: "printable" } })`
- blog post, project, product, and deck OG image rendering through `system_create({ entityType: "image", from: { sourceEntityType, attachmentType: "og-image" } })`
- `ogImageId` frontmatter support for posts/projects/products/decks and site-builder fallback to `coverImageId`
- absolute public OG/Twitter image URL enrichment for rendered site pages
- agent/eval guidance for printable PDF saves/regeneration and OG image generation

Still remaining:

- manual preview-site smoke of generated OG image metadata
- automatic publish-time/backfill asset generation, tracked separately in [Content pipeline publish assets](./content-pipeline-publish-assets.md)

Already available from previous work:

- Playwright/Chromium media rendering
- generated internal media pages served by a temporary static render server
- `image`/`pdf` view-template renderer slots
- source-derived attachment registry
- deck-owned PDF carousel provider
- durable `document` entities created via `system_create({ entityType: "document", from: ... })`
- `replace: true` regeneration for source-derived documents
- content-hash-aware dedup for source-derived document generation
- generated image entities and cover-image assignment through `system_create` / `system_update`

This plan tracks four media surfaces:

1. generated OG images for public pages: posts, projects, products, and decks
2. printable PDFs for blog posts
3. printable PDFs for projects/products
4. existing deck carousel PDFs, which remain separate from deck OG images

## Goals

- Reuse the existing media rendering substrate instead of adding ad hoc renderers.
- Keep durable artifacts on normal entity lifecycle surfaces:
  - images via `system_create({ entityType: "image", ... })`
  - PDFs via `system_create({ entityType: "document", from: ... })`
- Keep media artifacts deterministic and replaceable:
  - default: reuse content-hash-derived artifacts
  - `replace: true`: force regeneration
- Make generated media available to agents through clear natural-language operations.

## Non-goals

- Do not introduce separate `og-image`, `pdf`, or `media` entity types.
- Do not revive manual renderer/template `version` fields for dedup.
- Do not screenshot arbitrary public pages for OG images.
- Do not expose internal `/_media` render pages as public/indexable routes.
- Do not replace the completed deck carousel PDF flow.
- Do not make OG image generation mandatory for every public entity.

## Track 1 — OG images

### Desired behavior

Users can ask for an OG/social preview image for a public entity:

```ts
system_create({
  entityType: "image",
  prompt: "Generate an OG image for the post Resilience Is Not Redundancy",
  targetEntityType: "post",
  targetEntityId: "resilience-in-distributed-systems",
});
```

The generated image is stored as a normal `image` entity. The target public entity can reference it using an OG-specific field where supported.

### Metadata model

Add `ogImageId` only to selected public routed entity types that need it. Do not add it to base/common frontmatter.

Fallback order for public page head metadata:

1. `ogImageId`
2. `coverImageId`
3. site default OG image, if configured
4. no image tag

`HeadCollector` should receive final absolute public image URLs, not entity IDs.

### Rendering model

- Add dedicated OG media templates optimized for 1200×630.
- Render through internal generated media pages, e.g. `/_media/og/:templateId/:entityId/`.
- Capture PNG with Playwright.
- Persist PNG through existing image entity flow.
- Keep generated media pages out of navigation, sitemap, route registry, and SEO output.
- Add `noindex,nofollow` on internal media pages.

### Entity targets

Support routed public entity types that benefit from rich social cards:

- `post/og-image` ✅
- `project/og-image` ✅
- `product/og-image` ✅
- `deck/og-image` ✅

Deck OG images do not replace deck carousel PDFs. They are a single social preview PNG for the deck detail page, using the deck title, summary, slide count when available, and either the first slide or a deck-themed visual motif.

## Track 2 — Printable PDF for blog posts

### Desired behavior

Users can ask for a printable PDF of a blog post:

```ts
system_create({
  entityType: "document",
  from: {
    sourceEntityType: "post",
    sourceEntityId: "resilience-in-distributed-systems",
    attachmentType: "printable",
  },
});
```

Regeneration:

```ts
system_create({
  entityType: "document",
  from: {
    sourceEntityType: "post",
    sourceEntityId: "resilience-in-distributed-systems",
    attachmentType: "printable",
  },
  replace: true,
});
```

### Provider

Add a `post/printable` attachment provider that returns a PDF document attachment.

The provider should:

- fetch and validate the source post
- render an internal print media page
- export PDF through the existing PDF renderer path
- set filename/title metadata suitable for download
- rely on document generation's source `contentHash` dedup

### Template content

A printable blog PDF should include:

- title
- excerpt
- author/date/status where available
- canonical public URL where available
- optional cover image
- markdown body rendered with print-friendly typography
- page footer with source/canonical information

## Track 3 — Printable PDF for projects/products

### Desired behavior

Projects/products get the same durable document flow:

```ts
system_create({
  entityType: "document",
  from: {
    sourceEntityType: "project",
    sourceEntityId: "example-project",
    attachmentType: "printable",
  },
});
```

```ts
system_create({
  entityType: "document",
  from: {
    sourceEntityType: "product",
    sourceEntityId: "example-product",
    attachmentType: "printable",
  },
});
```

### Providers

Add source attachment providers where those entity packages exist and own the content shape:

- `project/printable`
- `product/printable`

If the current internal entity type differs from the user-facing word, preserve existing entity mapping and use the real registered entity type in provider registration.

### Project PDF template

Include:

- project title/name
- summary/tagline
- role/client/date/status where available
- problem / approach / outcome sections where available
- links and canonical URL
- optional cover image or gallery lead image

### Product PDF template

Include:

- product name/title
- tagline
- description
- key features
- pricing/CTA/details where available
- links and canonical URL
- optional product image

## Agent guidance

Add instructions for these natural-language intents:

- "Generate an OG image for post/project/product/deck X" → image generation targeting the entity, then `ogImageId` assignment if separate from cover behavior.
- "Save/export/download/print post X as PDF" → `system_create({ entityType: "document", from: { sourceEntityType: "post", sourceEntityId, attachmentType: "printable" } })`.
- "Regenerate printable PDF for project X" → same with `replace: true`.
- "Preview printable PDF" may use `document_generate` only if an immediate chat attachment is needed; durable saves use `system_create`.

## Implementation order

1. OG fallback plumbing: ✅
   - add selected `ogImageId` schemas/frontmatter
   - resolve `ogImageId` → absolute URL before `<Head />`
   - test fallback order and absolute URL output
2. OG rendering: ✅ for blog posts, projects, products, and decks
   - add first OG media template for blog posts
   - add project/product OG templates/providers
   - add deck OG template/provider
   - capture 1200×630 PNG
   - persist as image entity
   - verify media pages stay private/noindex
3. Blog printable PDF: ✅
   - add `post/printable` provider
   - add print media template
   - add unit tests and a Rover eval
4. Project/product printable PDFs: ✅
   - add providers/templates for project and product entity packages
   - add unit tests and Rover evals
5. Deck OG image support: ✅
   - add `deck/og-image` provider/template
   - add `ogImageId` frontmatter/schema support for deck detail metadata if missing
   - add unit tests and a Rover eval
6. Agent/eval polish: ✅ for blog/project/deck OG + printable PDF flows
   - update system and plugin instructions
   - add evals for OG image generation and printable PDF save/regenerate

## Validation

### Unit tests

- OG image URL fallback order: `ogImageId` > `coverImageId` > site default > absent.
- OG/Twitter image URLs are absolute public URLs.
- Internal OG media pages are `noindex,nofollow` and excluded from sitemap/navigation.
- PNG capture produces 1200×630 PNG output.
- `deck/og-image` provider resolves a deck and returns a PNG image attachment.
- `post/printable` provider resolves a post and returns a PDF document attachment.
- `project/printable` and `product/printable` providers return PDF document attachments.
- Printable PDFs reuse source `contentHash` dedup and regenerate with `replace: true`.

### Rover evals

- "Generate an OG image for the blog post X."
- "Generate an OG image for deck X."
- "Save the blog post X as a printable PDF."
- "Regenerate the printable PDF for project X."
- "Save product X as a printable PDF."

### Manual smoke checks

- Rebuild preview site after generating an OG image and inspect the target page HTML for `og:image` and `twitter:image`.
- Open generated printable PDFs and verify title/body/canonical URL render correctly.
- Confirm generated media pages do not appear in sitemap.
