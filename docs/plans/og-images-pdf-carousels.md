# Plan: OG Images on the Media Rendering Substrate

## Status

PDF carousel MVP is complete. This plan now tracks the remaining **OG image** phase only.

The reusable substrate exists:

- Playwright/Chromium media rendering
- generated internal media pages served by a temporary static render server
- `image`/`pdf` view-template renderer slots
- source-derived attachment registry
- deck-owned PDF carousel provider
- opaque carousel backgrounds that avoid LinkedIn PDF rasterization artifacts
- explicit/frozen `document` entity path, including durable PDF generation from source attachments
- `social-post.documents[]` references for attaching approved PDF artifacts
- LinkedIn native PDF document publishing through the current `/rest/documents` and `/rest/posts` APIs
- local/operator media preview tool with inline preview support for remotely generated artifacts
- Docker image support for Chromium media rendering

## Goal

Generate Open Graph images for selected public entities using the same media rendering substrate as PDF carousels.

OG images should:

- render from intentional internal media templates, not arbitrary public pages
- capture a 1200×630 PNG via Playwright
- persist as existing `image` entities
- integrate with site `<Head />` output as absolute public image URLs
- use predictable fallbacks when an entity has no generated OG image

## Non-goals

- Do not change the completed PDF carousel publishing path.
- Do not introduce a separate `og-image` entity type.
- Do not make OG image generation required for all entities.
- Do not expose `/_media` pages as public/indexable content.
- Do not screenshot arbitrary public site pages.
- Do not split media rendering into a separate worker until runtime role/job filtering exists.

## Remaining design

### OG image renderer

Add a dedicated OG media template/renderer for public entities.

Target shape:

```ts
renderers: {
  image?: ImageRenderer<T>;
}
```

The renderer should be a normal Preact component and may use the active site theme CSS. It should be optimized for a 1200×630 viewport.

### Media route/page

Render OG images through internal generated media pages, e.g.:

```text
/_media/og/:templateId/:entityId/
```

The page must:

- be generated only for media capture
- emit `noindex,nofollow`
- stay out of route registry/navigation/sitemap
- load the same theme CSS used by the site

### Image persistence

Captured PNGs should become normal `image` entities.

Selected public entities may receive:

```yaml
ogImageId: generated-og-image-id
```

Only add `ogImageId` to entities with public routes. Do not add it to common/base frontmatter.

### Fallback chain

When rendering public `<Head />` metadata, resolve image URLs in this order:

1. `ogImageId`
2. `coverImageId`
3. site default OG image, if configured
4. no image tag, if no usable image exists

`HeadCollector` should receive final absolute URL strings, not entity IDs.

### Public URL requirements

Generated head tags must use absolute public URLs:

```html
<meta property="og:image" content="https://example.com/images/example.png" />
<meta name="twitter:image" content="https://example.com/images/example.png" />
```

Do not point OG tags at temporary `/_media` routes or arbitrary responsive variants.

## Implementation order

1. Add an OG image media template/component for one public entity type.
2. Add a small generation path that renders the media page and calls `screenshotPng()` at 1200×630.
3. Persist the PNG into an `image` entity.
4. Add `ogImageId` support to selected public entity metadata/frontmatter only where needed.
5. Resolve `ogImageId`/`coverImageId`/site default image before `<Head />` rendering.
6. Ensure `HeadCollector` emits absolute `og:image` and `twitter:image` URLs.
7. Verify media pages remain excluded from navigation, sitemap, and SEO route output.
8. Add tests for fallback ordering and absolute URL generation.

## Validation

- Unit-test PNG rendering helper output dimensions and MIME/magic bytes.
- Unit-test OG template rendering for required text/image fields.
- Verify generated media pages include theme CSS.
- Verify generated media pages are `noindex,nofollow`.
- Verify generated media pages do not appear in sitemap/navigation.
- Verify `ogImageId` takes precedence over `coverImageId`.
- Verify `coverImageId` fallback works when no `ogImageId` exists.
- Verify site default OG fallback works when neither entity image exists.
- Verify no OG image tags are emitted when no image can be resolved.
- Verify emitted OG/Twitter image URLs are absolute public URLs.
- Smoke test OG PNG generation in Docker using the media rendering image path.
