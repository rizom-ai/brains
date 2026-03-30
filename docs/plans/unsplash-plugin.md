# Unsplash ServicePlugin Plan

## Overview

Add a ServicePlugin that integrates with the Unsplash API for stock photo search and selection. Two-tool design enforces a browse-and-pick workflow: search returns candidates, select materializes the chosen photo into an image entity.

## Structure

```
plugins/unsplash/
├── src/
│   ├── index.ts
│   ├── plugin.ts
│   ├── tools/index.ts
│   └── lib/unsplash-client.ts
└── test/
    ├── plugin.test.ts
    ├── tools.test.ts
    └── unsplash-client.test.ts
```

## Tools

### `unsplash_search`

**Input:**

- `query` (string) — Search terms
- `perPage` (number, 1–30, default 10) — Results per page
- `page` (number, default 1) — Pagination

**Output:**

- `photos[]` — id, description, altDescription, thumbnailUrl, photographerName, photographerUrl, unsplashUrl, downloadLocation, width, height
- `total`, `totalPages`, `page`

### `unsplash_select`

**Input:**

- `photoId` (string) — Unsplash photo ID from search results
- `downloadLocation` (string, URL) — Required for Unsplash API ToS download tracking
- `photographerName` (string) — For attribution
- `photographerUrl` (string, URL) — Photographer's Unsplash profile
- `unsplashUrl` (string, URL) — Photo page on Unsplash
- `imageUrl` (string, URL) — The regular-size image URL to download
- `title` (string, optional) — Image entity title
- `alt` (string, optional) — Alt text
- `targetEntityType` (string, optional) — Entity type to set cover on
- `targetEntityId` (string, optional) — Entity ID to set cover on

**Output:**

- `imageEntityId`, `alreadyExisted`, `attribution`, `coverSet?`

## Key Design Decisions

### Constructor DI

`UnsplashClient` receives a `fetch` function via `UnsplashDeps`. Tools factory receives a `fetchImage` function. Single injection point through plugin constructor `deps` — no `globalThis.fetch` mocking needed in tests.

```typescript
interface UnsplashDeps {
  fetch?: FetchFn;
  fetchImage?: (url: string) => Promise<string>;
}
```

### Attribution Storage

Stored as `metadata.attribution` on the image entity:

```yaml
attribution:
  photographerName: "Jane Smith"
  photographerUrl: "https://unsplash.com/@janesmith"
  unsplashUrl: "https://unsplash.com/photos/abc123"
```

Passes through existing frontmatter adapter without modifying `@brains/image` schema — extra metadata fields round-trip through YAML frontmatter.

### Download Tracking

`triggerDownload(downloadLocation)` fires in `unsplash_select` per Unsplash API ToS. Fire-and-forget with error logged, never blocks image creation.

### Graceful Degradation

`getTools()` returns `[]` when `UNSPLASH_ACCESS_KEY` is absent, matching the Buttondown plugin pattern. Plugin registers but exposes no tools.

### Deduplication

Uses `metadata.sourceUrl` matching the `urls.regular` URL from Unsplash. Reuses existing image entity if found.

## Data Flow

```
User → unsplash_search({ query, perPage })
  → UnsplashClient.searchPhotos()
    → GET https://api.unsplash.com/search/photos?query=...&per_page=...
  → toolSuccess({ photos: [...candidates] })
  → User picks a photo

User → unsplash_select({ photoId, downloadLocation, imageUrl, ... })
  → Check deduplication via entityService.listEntities("image", sourceUrl filter)
  → UnsplashClient.triggerDownload(downloadLocation)  ← Unsplash ToS requirement
  → fetchImage(imageUrl) → base64 data URL
  → detectImageFormat + detectImageDimensions
  → entityService.createEntity({ entityType: "image", content: dataUrl, metadata: { ... } })
  → [optional] setCoverImageId on target entity
  → toolSuccess({ imageEntityId, attribution, ... })
```

## Build Sequence (test-first)

- [ ] **Phase 1: Scaffold** — package.json, empty exports, `bun install`, typecheck
- [ ] **Phase 2: UnsplashClient** — tests first, then implementation
- [ ] **Phase 3: Tools** — tests first with harness + mock deps, then handlers
- [ ] **Phase 4: Plugin class** — lifecycle tests, then wiring
- [ ] **Phase 5: Integration** — exports, `UNSPLASH_ACCESS_KEY` in example.env, update codebase map

## Configuration

```typescript
// In app registration
brain.register(
  unsplashPlugin({
    apiKey: process.env.UNSPLASH_ACCESS_KEY,
  }),
);
```

API key from https://unsplash.com/developers — free tier: 50 req/hour (demo), production: 5000 req/hour.
