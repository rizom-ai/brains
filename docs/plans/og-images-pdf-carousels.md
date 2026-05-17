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

Support source-entity-driven media generation:

- decks can provide carousel attachments through entity-owned renderers/providers
- carousel attachments are emitted as PDFs for social publishing
- other future document/image artifacts can reuse the same substrate
- single PNGs for OG images remain phase 2

PDF carousels are the primary deliverable and should ship first. OG images and other PDF document types reuse the same substrate after the PDF path is proven.

## Non-goals

- Do not auto-screenshot arbitrary public site pages — use intentional, bespoke media routes
- Do not introduce a separate deployment worker until the runtime supports explicit process roles and safe job filtering
- Do not target edge/Lambda runtimes for media generation
- Do not duplicate the template / data-source system
- Do not overload `image` entities for PDFs
- Do not require OG image generation for the PDF-first MVP
- Do not expose media render routes as public/indexable site content
- Do not introduce a separate `carousel` entity while carousels are still authored as ordinary decks
- Do not require `social-post.documents[]` for idempotent, source-derived carousel PDFs
- Do not make publishers depend on deck renderer names such as `carousel` or `pdf`

## Rendering approach

```text
source entity + attachment request
  -> source plugin resolves an artifact provider
  -> provider renders an internal media page
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

This also enables a deck-owned carousel path: a deck can map `attachmentType: "carousel"` to whatever renderer it owns internally, whether that is a static media template, a Reveal print route, or a future dedicated deck PDF renderer.

## Template integration

Extend the **view-template** renderer contracts, not `createTemplate`, but keep renderer names as source-plugin implementation details.

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

For cross-plugin use, expose **artifact/attachment capabilities**, not renderer names. A caller should ask for a semantic attachment, and the source plugin should choose the renderer:

```ts
resolveAttachment({
  sourceEntityType: "deck",
  sourceEntityId: "ai-stress-test",
  attachmentType: "carousel",
});
```

The response declares the concrete output:

```ts
{
  type: "document",
  mimeType: "application/pdf",
  filename: "ai-stress-test-carousel.pdf",
  data: Buffer,
}
```

(The `type` discriminant matches `PublishMediaData` in `@brains/contracts`, which the publisher already consumes.)

Do not include `mimeType` in the MVP request. If one `attachmentType` later supports multiple formats, add explicit negotiation then.

The MVP has exactly one `attachmentType` (`"carousel"`), so the registry indirection is not fully exercised yet — the publisher still hardcodes the string `"carousel"`. That is acceptable; the abstraction earns its keep when a second attachment type lands. Until then, treat the registry as the seam that lets the deck plugin choose its renderer without the publisher importing deck internals, rather than as a fully-general capability lookup.

## Theme data for media renderers

Media renderers have access to the **full site theme** — Tailwind, theme tokens, design system components. Since rendering goes through a real browser, there is no CSS subset to work around.

The PDF-first implementation must ensure media templates are included in Tailwind's content/source scan before Playwright captures output. If media pages are generated outside normal public routes, their HTML must still be present in the build/temp output used for CSS generation, or their templates must be explicitly included through Tailwind source configuration.

## Media execution mode

MVP uses generated internal HTML pages plus a temporary local static render server:

- Render media templates into `/_media/.../index.html` inside the site build output
- Keep `/_media` out of the route registry so it does not appear in navigation, sitemap, or SEO route output
- Serve the build output from a temporary localhost server during Playwright capture so absolute paths such as `/styles/main.css` and site assets resolve exactly like normal pages
- Treat `/_media` paths as internal render artifacts, not user-authored public routes

## Trigger model

Generated media is produced via **explicit attachment/artifact resolution**, not during site build or request handling.

- The social post stores source intent (`sourceEntityType`, `sourceEntityId`), not generated carousel document IDs by default
- Publishing resolves a source-derived attachment by semantic type, e.g. `attachmentType: "carousel"`
- For LinkedIn MVP, the trigger is provider availability: if a social post has `sourceEntityType/sourceEntityId`, ask for `attachmentType: "carousel"`; use it only if a provider exists
- The manual operator surface, if needed, is `document_generate` over the same attachment contract; it freezes the result as a durable artifact instead of being required for normal publishing
- Site-builder may provide internal HTML/media pages, but it should not own the public document-generation or publishing contract
- Follows the existing job-handler pattern used by image generation, without coupling media generation to `ImageGenerationJobHandler`
- Lets one entity change regenerate one artifact, instead of forcing a full rebuild
- Keeps site builds fast
- Carousels can be generated from a `social-post` draft source, independent of build cadence

MVP browser lifecycle: launch Chromium **on demand per media job or short batch**, then close it in `finally`. If shutdown fails or the job times out, kill the browser process. This is slower than a warm pool, but safer for the current single-process brain deployment.

A warm browser pool can be added later only if media generation volume justifies it.

## PDF carousels (primary path)

- Author carousels as ordinary `deck` entities for the MVP
- The deck plugin owns the mapping from `attachmentType: "carousel"` to an internal renderer/provider
- Render each carousel as a multi-page route — one HTML "page" per slide with `@page` CSS sizing
- Capture once via `page.pdf({ width, height, printBackground: true })` — Playwright handles multi-page natively
- Return the generated PDF as a publish attachment (`kind: "document"`, `mimeType: "application/pdf"`, `filename`, `data`)
- Do **not** store the PDF as a `document` entity or attach it to `social-post.documents[]` for the normal idempotent path
- Store a `document` entity only when explicitly freezing/approving/auditing a concrete artifact
- Enforce a maximum slide/page count before rendering
- Enforce a maximum output PDF size before storing/publishing

For carousels assembled from disparate sources (e.g., merging a cover page generated separately with a body deck), use `pdf-lib` to combine. MVP carousels do not need this.

### `document` entity

- New entity, parallel to `image`, but reserved for frozen/approved artifacts rather than required render cache
- Stores PDF binary as base64 data URL (same shape as `image.content`)
- Must be durable brain-data content when used: exported/imported through the normal entity persistence and directory-sync path, with round-trip tests for PDF data URLs
- Metadata should explicitly include:
  - `mimeType: "application/pdf"`
  - `filename`
  - `pageCount`
  - `sourceEntityType`
  - `sourceEntityId`
  - `attachmentType` such as `"carousel"`
  - deterministic `dedupKey` or snapshot key
- Job-generated; not user-authored
- The `document` plugin owns freezing/storing durable document artifacts; site-builder remains responsible only for site/media HTML composition helpers

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

Then update social publishing to support resolved document attachments.

For the idempotent carousel path, the publish preparation flow should:

1. read the `social-post` source reference (`sourceEntityType`, `sourceEntityId`)
2. ask the attachment/artifact registry for `attachmentType: "carousel"`
3. pass the returned `PublishMediaData` to the provider

Do not require `documents[]` for this path. Keep `coverImageId` as the image/visual-preview path.

Keep `documents[]` as a layered, explicit override path rather than ripping it out immediately. Publish preparation should prefer explicit frozen/manual documents when present, then try source-derived attachments. In the explicit path, `document` entities store base64 data URLs and publishers convert to `Buffer` at the boundary.

For LinkedIn, publish PDF carousels as document/PDF posts rather than ad carousel posts.

## Dedup

Generated attachments should use a deterministic key derived from source entity content hash, attachment type, and renderer/provider version.

- **Non-frozen publish path: no cache.** Publishing is one-shot per `social-post` (early-exit on `status: "published"`, max ~4 attempts via `RetryTracker`), and the existing `ImageGenerationJobHandler` doesn't cache either. A 5–15s Playwright render at most a few times per post lifetime does not justify a separate cache layer.
- **Frozen path: dedup on `document` entity metadata.** When `document_generate` freezes an attachment, store `dedupKey` on the resulting `document` and reuse by `dedupKey` lookup, the way `DocumentGenerationJobHandler.findDocumentByDedupKey` already does.
- Do not overload `sourceUrl` for the key — generated artifacts do not necessarily come from URLs.
- If render volume later proves the per-publish regenerate cost is real, introduce a content-addressed cache then, scoped to a single provider and keyed exactly the same way as the frozen-document `dedupKey` so freeze can promote a cache entry by copy.

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

## Migration from the current WIP

The current implementation has useful pieces from the old plan: document entity storage, LinkedIn document publishing, `documents[]` support, internal media pages, and Playwright PDF rendering. Migrate in layers rather than ripping these out.

1. [x] Keep `documents[]` publishing as the explicit/frozen artifact path.
2. [x] Add the attachment/artifact registry alongside it.
3. [x] Register the deck `attachmentType: "carousel"` provider.
4. [x] Update publish preparation to prefer explicit `documents[]`, then resolve source-derived carousel attachments when a provider exists.
5. [x] Refactor `document_generate` to freeze a resolved attachment into a `document` entity.
6. [x] Move carousel orchestration out of site-builder and into the deck-owned provider; site-builder remains only an HTML/media-page composition helper.

The seam between a deck provider and rendering infrastructure should be explicit: provider code owns deck semantics and attachment selection; shared media-renderer owns browser/PDF capture; shared media-page-composer helpers may compose the temporary HTML page.

### Registry home

The attachment registry lives at `shell/plugins/src/service/attachment-registry.ts`, exposed through `ServicePluginContext` (`shell/plugins/src/service/context.ts`). It follows the singleton + `getInstance`/`createFresh` pattern used by `TemplateRegistry`, `HandlerRegistry`, and `ProviderRegistry`. `publishExecuteHandler` already has `ServicePluginContext`, so no new wiring is needed at the call site. Shape mirrors `ProviderRegistry` (per-`sourceEntityType` strategy), with `register(sourceEntityType, attachmentType, provider)` and `resolve({sourceEntityType, sourceEntityId, attachmentType})`.

### Field rename: `sourceTemplate` → `attachmentType`

Completed as a pure code rename: no `document` entities exist on disk anywhere in `brains/`, no PDF entities have ever been committed (`git log --all --diff-filter=A -- '*.pdf'` is empty), no `.meta.json` sidecars exist. The field lived only in code (`shared/document/src/schemas/document.ts`, `shared/document/src/adapters/document-adapter.ts`) and any runtime `custom.db` rows on dev machines, which are regeneratable. Brain-data round-trip tests now assert `attachmentType`; no migration shim is included.

### Promoting the media-page composer to shared API

Extract to a new `shared/media-page-composer/` package (preferred) or fold into `shared/media-renderer/`. The composer is loosely coupled:

- **Generic and extractable**: `plugins/site-builder/src/lib/media-render-page.ts` (tmp-dir + ephemeral HTTP server, only depends on `fs`/`http`/`path` + the template renderer) and `plugins/site-builder/src/lib/media-template-renderer.ts` (preact + `@brains/ui-library` + `@brains/site-engine` primitives — `HeadCollector`, `createHTMLShell`, `SiteImageRendererService`).
- **Only site-builder coupling**: a single `SiteBuilderOptions["siteConfig"]` type import (2 fields: `title`, `themeMode`). Replace with a local `MediaSiteConfig` interface during the move.
- Estimated effort: a few hours, mostly mechanical. After the move, both site-builder and the deck provider import from `shared/media-page-composer/`.

Lock the function signature and add a public-surface test before deck code starts depending on it.

## Implementation order

PDF-first ordering. OG image wiring follows once the PDF substrate and LinkedIn document publishing are proven.

1. Audit current view-template renderer contracts and consumers
2. Extend `ViewTemplate` and `SiteViewTemplate` with backward-compatible `image` and `pdf` renderer slots
3. Create `shared/media-renderer/` package. Add Playwright (`playwright-core` + Chromium), on-demand browser lifecycle, render-by-URL helper exposing `screenshotPng(url, viewport)` and `renderPdf(url, options)`
4. Add a `document` entity (schema, adapter, plugin) parallel to `image`, but use it for frozen/approved artifacts rather than default cache; verify brain-data export/import round-trips
5. Choose and implement the media route execution mode for the MVP: concrete generated internal HTML pages served by a temporary local render server
6. Ensure media template HTML participates in CSS/Tailwind generation
7. [x] Add an attachment/artifact capability registry with request shape `{ sourceEntityType, sourceEntityId, attachmentType }`
8. [x] Register a deck-owned `attachmentType: "carousel"` provider that renders normal deck content as a multi-page PDF
9. [x] Update `document_generate` to use the attachment contract and freeze the returned document only when explicitly requested
10. [x] Extend the publish contract with document attachment data
11. [x] Update publish preparation and social publishing to prefer explicit `documents[]`, then resolve source-derived carousel attachments while preserving `coverImageId` image behavior
12. [x] Add LinkedIn document upload/publish support without requiring `social-post.documents[]` for generated carousels
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
- Verify attachment cache/reuse key stability on unchanged entity input
- Verify frozen `document` entities persist to brain-data and import/export PDF data URLs without corruption
- Verify normal carousel publish does not require `social-post.documents[]`
- Verify explicit `documents[]` still publishes frozen/manual document artifacts
- Mock LinkedIn document upload/publish in tests
- Smoke test: app image builds with Chromium installed; render job runs end-to-end without render-on-request
- Phase 2: verify site head emits absolute `og:image` and `twitter:image` URLs
