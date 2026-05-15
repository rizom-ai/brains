# Plan: PDF Carousels and OG Images

## Status

Proposed.

## Context

We want generated LinkedIn-style PDF carousels and Open Graph images. Render via **Playwright** so we get one rendering substrate covering: fixed-dimension images (OG), multi-page document flow (future invoices/reports), full CSS fidelity, and reuse of existing site components.

Reuse the existing template stack for data and validation:

- `createTemplate` (data templates, schema, data-source binding)
- Zod schemas
- data sources / content resolution
- entity-driven inputs

Add media render outputs by introducing a Playwright-based renderer on the view-template layer and exposing dedicated render routes in the site.

## Goal

Support template-driven media generation:

- multiple PNG slides for social carousels
- PDFs assembled from carousel slides (and other future PDF document types)
- single PNGs for OG images

PDF carousels are the primary deliverable. OG images and other PDF document types reuse the same substrate.

## Non-goals

- Do not auto-screenshot arbitrary public site pages — use intentional, bespoke media routes
- Do not bundle the browser binary into interface/CLI/app images — keep Playwright in a dedicated worker
- Do not target edge/Lambda runtimes for media generation
- Do not duplicate the template / data-source system
- Do not overload `image` entities for PDFs

## Rendering approach

```text
TSX template + data
  -> media route in site (server-rendered)
  -> Playwright navigates and captures
     - PNG via page.screenshot() for images
     - PDF via page.pdf() for documents
```

Recommended packages:

- `playwright-core` (no auto-install; install browsers explicitly)
- `pdf-lib` — optional, only when assembling/manipulating PDFs from multiple sources

### Engine: WebKit

Default to **WebKit** rather than Chromium. ~80 MB vs ~250 MB on disk, same Playwright API, real browser engine with full CSS. Drop to Chromium per-template only if a specific design need exposes a WebKit gap.

### Render routes

Render targets live as dedicated routes in the site (e.g., `/_media/og/:templateId/:entityId`, `/_media/carousel/:templateId/:entityId`). Each route:

- Server-renders the media component with resolved data
- Sets the viewport size via CSS / route meta
- Is not linked from the public site
- Is intentionally Playwright's entry point — clear contract between renderer and templates

This also enables a "render an existing Reveal deck as a PDF carousel" path later: navigate the existing deck route with `?print-pdf`, capture via `page.pdf()`.

## Template integration

Extend the **view-template** renderer contracts, not `createTemplate`.

- `ViewTemplate` at `shell/templates/src/render-types.ts` currently exposes `renderers: { web?: WebRenderer<T> }`
- `SiteViewTemplate` at `plugins/site-builder/src/lib/site-view-template.ts` mirrors this
- `createTemplate` (data template) has no `renderers` field and stays untouched

Target shape:

```ts
renderers: {
  web?: WebRenderer<T>;
  image?: ImageRenderer<T>;
  pdf?: PdfRenderer<T>;
}
```

`web` stays untouched so existing consumers compile unchanged.

Media renderers are ordinary React components that mount on media routes — same JSX, same Tailwind, same primitives as the rest of the site. No "Satori-safe" parallel component system.

## Theme data for media renderers

Media renderers have access to the **full site theme** — Tailwind, theme tokens, design system components. Since rendering goes through a real browser, there is no CSS subset to work around.

## Trigger model

Generated media is produced via **explicit jobs**, not during site build or on-demand.

- Extends the existing `ImageGenerationJobHandler` pattern in `entities/image/src/image-plugin.ts`
- Lets one entity change regenerate one artifact, instead of forcing a full rebuild
- Keeps site builds fast
- Carousels can be generated on `social-post` draft, independent of build cadence

The job worker maintains a **warm Playwright browser** (single browser, page per job). Cold launch is ~1 s once at worker start; per-render cost is then ~300–800 ms.

## PDF carousels (primary path)

- Render each carousel as a multi-page route — one HTML "page" per slide with `@page` CSS sizing
- Capture once via `page.pdf({ width, height, printBackground: true })` — Playwright handles multi-page natively
- Store the PDF as a new `document` entity
- Attach the document entity to a `social-post` via a new `documentId` field

For carousels assembled from disparate sources (e.g., merging a cover page generated separately with a body deck), use `pdf-lib` to combine. MVP carousels do not need this.

### `document` entity

- New entity, parallel to `image`
- Stores PDF binary as base64 data URL (same shape as `image.content`), plus mime type, page count, source template, deterministic dedup key
- Job-generated; not user-authored

## OG images (follows carousel substrate)

- Render OG component on a media route at 1200×630
- Capture via `page.screenshot({ type: "png" })`
- Store the PNG as an existing `image` entity
- Add `ogImageId` only to **selected entities** (those with public routes) — not common frontmatter
- Fallback chain:
  1. `ogImageId`
  2. `coverImageId` (already on `social-post`)
  3. site default OG image
- Wire `ogImageId` resolution into `HeadProps` / `HeadCollector` and ensure absolute URLs for `og:image` and `twitter:image`

## Publishing changes

Current publishing supports a single optional image (`PublishImageData` at `shared/contracts/src/publish-types.ts`, single `imageData?` param). Extend toward media attachments:

```ts
type PublishMediaData =
  | { type: "image"; data: Buffer; mimeType: string; filename?: string }
  | {
      type: "document";
      data: Buffer;
      mimeType: "application/pdf";
      filename: string;
    };
```

Then update social publishing to support `media[]`.

Note: `image` and `document` entities store base64 data URLs; publishers convert to `Buffer` at the boundary.

For LinkedIn, publish PDF carousels as document/PDF posts rather than ad carousel posts.

## Dedup

Generated artifacts set a deterministic dedup key (template id + content hash) on the `image`/`document` entity's `sourceUrl`-equivalent field, so a job for an unchanged entity reuses the existing artifact instead of regenerating.

## Bundling & deployment

Playwright has real operational costs. Plan for them upfront.

- **Isolate the renderer**: new package `shared/media-renderer/` owns the Playwright dependency. Other packages do not transitively pull it in
- **Dedicated job worker**: only the worker that runs media jobs needs Playwright + WebKit. Interface bundles (CLI, MCP, Matrix, Discord) stay lean
- **Install step**: `bunx playwright install webkit` is required. Add to:
  - Worker package's `postinstall` or a Turbo `media-renderer#install-browsers` task
  - CI pipeline (cache `~/.cache/ms-playwright` to avoid re-downloading)
  - Worker Dockerfile
- **No single-binary compile** for the worker — `bun build --compile` can't embed Chromium/WebKit. Other interfaces stay compile-friendly
- **Docker image size**: worker image gains ~80 MB for WebKit; other images unaffected
- **Local dev**: contributors run `bunx playwright install webkit` once; CI does the same. Document in repo README / contributing guide

## Implementation order

PDF-first ordering. OG image wiring follows once the substrate is proven.

1. Audit current view-template renderer contracts and consumers
2. Extend `ViewTemplate` and `SiteViewTemplate` with backward-compatible `image` and `pdf` renderer slots
3. Create `shared/media-renderer/` package. Add Playwright (`playwright-core` + WebKit), warm-browser pool, render-by-URL helper exposing `screenshotPng(url, viewport)` and `renderPdf(url, options)`
4. Add a `document` entity (schema, plugin, job handler) parallel to `image`
5. Add the `/_media/carousel/:templateId/:entityId` site route. Build a single carousel slide as a PoC and render it via the helper
6. Render a full multi-page carousel route; capture via `page.pdf()`; store as `document`
7. Extend the publish contract to `media[]` with `PublishMediaData`
8. Add LinkedIn document upload/publish support; attach `documentId` to `social-post`
9. Add the `/_media/og/:templateId/:entityId` route. Build OG component PoC
10. Generate OG PNGs into existing `image` entities via the helper; add `ogImageId` to selected entities with fallback to `coverImageId`
11. Wire `ogImageId` resolution and absolute URL handling into `HeadProps` / `HeadCollector`

## Validation

- Unit-test the render-by-URL helper (PNG dimensions, MIME type, browser pool lifecycle)
- Unit-test view-template renderer contract backward compatibility (existing `web`-only templates still build)
- Verify PDF generation produces one page per carousel slide
- Verify dedup key reuse on unchanged entity input
- Verify site head emits absolute `og:image` and `twitter:image` URLs
- Mock LinkedIn document upload/publish in tests
- Smoke test: worker Docker image builds with WebKit installed; render job runs end-to-end
