# Plan: PDF Carousels and OG Images

## Status

Proposed; reviewed and refined for a **PDF-first MVP**. OG images remain in scope, but only after PDF carousel generation and LinkedIn document publishing work end-to-end.

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

PDF carousels are the primary deliverable and should ship first. OG images and other PDF document types reuse the same substrate after the PDF path is proven.

## Non-goals

- Do not auto-screenshot arbitrary public site pages — use intentional, bespoke media routes
- Do not introduce a separate deployment worker until the runtime supports explicit process roles and safe job filtering
- Do not target edge/Lambda runtimes for media generation
- Do not duplicate the template / data-source system
- Do not overload `image` entities for PDFs
- Do not require OG image generation for the PDF-first MVP
- Do not expose media render routes as public/indexable site content

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

### Engine: Chromium for PDF

Default to **Chromium** for the worker because `page.pdf()` is Chromium/headless-oriented in Playwright. This matters because PDF carousels are the primary deliverable.

WebKit remains an optional future optimization for screenshot-only image generation, but the MVP should not depend on WebKit for PDFs. If we later choose a screenshot-to-PDF path, WebKit + `pdf-lib` can be reconsidered.

### Render routes

Render targets live as dedicated internal routes in the site (e.g., `/_media/og/:templateId/:entityId`, `/_media/carousel/:templateId/:entityId`). Each route:

- Server-renders the media component with resolved data
- Sets the viewport/page size via CSS / route meta
- Is not linked from the public site
- Is excluded from navigation, sitemap, and SEO output
- Emits `noindex` if it is ever served over HTTP
- Is intentionally Playwright's entry point — clear contract between renderer and templates

Because the current site builder is static, the implementation must choose one explicit execution mode for these routes:

1. **Concrete generated media pages**: generate one static internal HTML page per media job into a temporary/build-only location, then point Playwright at that file or a local static server.
2. **Temporary render server**: start an app-local HTTP render endpoint for the duration of the job, render exactly the requested media route, then shut it down.

The MVP should prefer the smallest route that reuses the existing Preact rendering/data-resolution path without registering media pages as normal public routes.

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

Media renderers are ordinary Preact/JSX components that mount on media routes — same JSX style, same Tailwind, same primitives as the rest of the site. No "Satori-safe" parallel component system.

## Theme data for media renderers

Media renderers have access to the **full site theme** — Tailwind, theme tokens, design system components. Since rendering goes through a real browser, there is no CSS subset to work around.

The PDF-first implementation must ensure media templates are included in Tailwind's content/source scan before Playwright captures output. If media pages are generated outside normal public routes, their HTML must still be present in the build/temp output used for CSS generation, or their templates must be explicitly included through Tailwind source configuration.

## Trigger model

Generated media is produced via **explicit jobs**, not during site build or request handling.

- Follows the existing job-handler pattern used by image generation, without coupling media generation to `ImageGenerationJobHandler`
- Lets one entity change regenerate one artifact, instead of forcing a full rebuild
- Keeps site builds fast
- Carousels can be generated on `social-post` draft, independent of build cadence

MVP browser lifecycle: launch Chromium **on demand per media job or short batch**, then close it in `finally`. If shutdown fails or the job times out, kill the browser process. This is slower than a warm pool, but safer for the current single-process brain deployment.

A warm browser pool can be added later only if media generation volume justifies it.

## PDF carousels (primary path)

- Render each carousel as a multi-page route — one HTML "page" per slide with `@page` CSS sizing
- Capture once via `page.pdf({ width, height, printBackground: true })` — Playwright handles multi-page natively
- Store the PDF as a new `document` entity
- Attach the document entity to a `social-post` via the planned `documents[]` field
- Enforce a maximum slide/page count before rendering
- Enforce a maximum output PDF size before storing/publishing

For carousels assembled from disparate sources (e.g., merging a cover page generated separately with a body deck), use `pdf-lib` to combine. MVP carousels do not need this.

### `document` entity

- New entity, parallel to `image`
- Stores PDF binary as base64 data URL (same shape as `image.content`)
- Metadata should explicitly include:
  - `mimeType: "application/pdf"`
  - `filename`
  - `pageCount`
  - `sourceEntityType`
  - `sourceEntityId`
  - `sourceTemplate`
  - deterministic `dedupKey`
- Job-generated; not user-authored

## OG images (phase 2, follows carousel substrate)

OG images should follow after PDF carousel generation and LinkedIn document publishing are working end-to-end.

- Render OG component on a media route at 1200×630
- Capture via `page.screenshot({ type: "png" })`
- Store the PNG as an existing `image` entity
- Add `ogImageId` only to **selected entities** (those with public routes) — not common frontmatter
- Fallback chain:
  1. `ogImageId`
  2. `coverImageId`
  3. site default OG image (`defaultOgImageId` or equivalent site metadata)
- Resolve `ogImageId`/fallbacks before rendering `<Head />`; `HeadCollector` should receive final URL strings, not entity IDs
- Ensure `og:image` and `twitter:image` are absolute URLs
- Ensure OG URLs point at a canonical public image file, not an arbitrary responsive variant

## Publishing changes

Current publishing supports a single optional image (`PublishImageData` at `shared/contracts/src/publish-types.ts`, single `imageData?` param). Extend toward document attachments:

```ts
type PublishMediaData = {
  type: "document";
  data: Buffer;
  mimeType: "application/pdf";
  filename: string;
};

// Existing PublishImageData remains the coverImageId path for image posts.
```

Then update social publishing to support document attachments via `documents[]`.

This must include the content-pipeline/social publish preparation path, which currently extracts a single `coverImageId` and passes one optional `imageData`. Keep `coverImageId` as the image/visual-preview path while adding `documents[]` for document attachments.

Note: `image` and `document` entities store base64 data URLs; publishers convert to `Buffer` at the boundary.

For LinkedIn, publish PDF carousels as document/PDF posts rather than ad carousel posts.

## Dedup

Generated artifacts set a deterministic `dedupKey` (template id + source entity id + content/template hash) on the `image`/`document` metadata, so a job for an unchanged entity reuses the existing artifact instead of regenerating.

Add explicit schema support for `dedupKey` before relying on it. Do not overload `sourceUrl` for this, because generated artifacts do not necessarily come from URLs.

## Bundling & deployment

Playwright has real operational costs. Plan for them upfront.

- **Isolate the renderer**: new package `shared/media-renderer/` owns the Playwright dependency. Other packages should not import it unless they actually perform media rendering
- **Current deployment**: yeehaa.io currently runs as one brain process/container. Keep the MVP in that process, but make media jobs explicit, bounded, and low-concurrency
- **Do not split yet**: the runtime does not currently support true worker-only/job-only mode. `register-only` and `startup-check` both avoid job workers, and normal start launches daemons, ready hooks, schedulers, and the job worker together. Splitting now would require runtime role support and safe job filtering
- **Install step**: `bunx playwright install chromium` is required. Add to:
  - App image / package install path that runs media jobs
  - CI pipeline (cache `~/.cache/ms-playwright` to avoid re-downloading)
  - Dockerfile
- **No single-binary compile** for the media-capable runtime — `bun build --compile` can't embed Chromium. Other future interfaces can stay compile-friendly if they do not import the renderer
- **Docker image size**: the media-capable app image gains the Chromium browser payload
- **Local dev**: contributors run `bunx playwright install chromium` once; CI does the same. Document in repo README / contributing guide

Operational safeguards for same-process MVP:

- media job concurrency `1`
- hard timeout around the full render job
- max slide/page count
- max output PDF size
- launch Chromium per job/short batch
- always `browser.close()` in `finally`
- kill the browser process on timeout/error if needed
- no render-on-request path

Future split is still useful for blast-radius control, but should wait until the runtime supports process roles, role-aware plugin ready hooks, and job type filtering.

## Implementation order

PDF-first ordering. OG image wiring follows once the PDF substrate and LinkedIn document publishing are proven.

1. Audit current view-template renderer contracts and consumers
2. Extend `ViewTemplate` and `SiteViewTemplate` with backward-compatible `image` and `pdf` renderer slots
3. Create `shared/media-renderer/` package. Add Playwright (`playwright-core` + Chromium), on-demand browser lifecycle, render-by-URL helper exposing `screenshotPng(url, viewport)` and `renderPdf(url, options)`
4. Add a `document` entity (schema, adapter, plugin) parallel to `image`, with metadata for filename/page count/source/dedup
5. Choose and implement the media route execution mode for the MVP: concrete generated internal HTML pages or a temporary local render server
6. Ensure media template HTML participates in CSS/Tailwind generation
7. Add the `/_media/carousel/:templateId/:entityId` render path. Build a single carousel slide as a PoC and render it via the helper
8. Render a full multi-page carousel route; capture via `page.pdf()`; store as `document`
9. Add/queue the explicit media generation job handler with timeout, max page count, max PDF size, and browser cleanup
10. Extend the publish contract with document attachment data
11. Update publish preparation and social publishing to support `documents[]` while preserving `coverImageId` image behavior
12. Add LinkedIn document upload/publish support; attach documents to `social-post` via `documents[]`
13. Add the `/_media/og/:templateId/:entityId` route. Build OG component PoC
14. Generate OG PNGs into existing `image` entities via the helper; add `ogImageId` to selected entities with fallback to `coverImageId` and site default OG image
15. Resolve `ogImageId`/fallbacks before `<Head />`, and ensure `HeadCollector` emits absolute `og:image` and `twitter:image` URLs

## Validation

- Unit-test the render-by-URL helper (PNG dimensions, PDF MIME type, browser close/cleanup behavior)
- Unit-test view-template renderer contract backward compatibility (existing `web`-only templates still build)
- Verify media routes/pages are excluded from navigation, sitemap, and public SEO output
- Verify media template styles are present in captured PDF output
- Verify PDF generation produces one page per carousel slide
- Verify max page count and max output size safeguards fail safely
- Verify document dedup key reuse on unchanged entity input
- Mock LinkedIn document upload/publish in tests
- Smoke test: app image builds with Chromium installed; render job runs end-to-end without render-on-request
- Phase 2: verify site head emits absolute `og:image` and `twitter:image` URLs
