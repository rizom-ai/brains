# Stock Photo ServicePlugin Plan

## Overview

Add a ServicePlugin that integrates with stock photo APIs for image search and selection. Two-tool design enforces a browse-and-pick workflow: search returns candidates, select materializes the chosen photo into an image entity.

Provider-agnostic plugin name (`stock-photo`), with `provider` config selecting the backend. Unsplash is the first (and currently only) provider.

## Structure

```
plugins/stock-photo/
├── src/
│   ├── index.ts
│   ├── plugin.ts
│   ├── tools/index.ts
│   └── lib/
│       ├── types.ts              # shared provider interface
│       └── unsplash-client.ts    # Unsplash provider
└── test/
    ├── plugin.test.ts
    ├── tools.test.ts
    └── unsplash-client.test.ts
```

## Tools

### `stock-photo_search`

**Input:**

- `query` (string) — Search terms
- `perPage` (number, 1–30, default 10) — Results per page
- `page` (number, default 1) — Pagination

**Output:**

- `photos[]` — id, description, altDescription, thumbnailUrl, photographerName, photographerUrl, sourceUrl, downloadLocation, width, height
- `total`, `totalPages`, `page`

### `stock-photo_select`

**Input:**

- `photoId` (string) — Photo ID from search results
- `downloadLocation` (string, URL) — Provider download tracking URL (required by Unsplash ToS)
- `photographerName` (string) — For attribution
- `photographerUrl` (string, URL) — Photographer's profile
- `sourceUrl` (string, URL) — Photo page on provider
- `imageUrl` (string, URL) — The regular-size image URL to download
- `title` (string, optional) — Image entity title
- `alt` (string, optional) — Alt text
- `targetEntityType` (string, optional) — Entity type to set cover on
- `targetEntityId` (string, optional) — Entity ID to set cover on

**Output:**

- `imageEntityId`, `alreadyExisted`, `attribution`, `coverSet?`

## Provider Interface

```typescript
interface StockPhotoProvider {
  searchPhotos(
    query: string,
    options: { page: number; perPage: number },
  ): Promise<SearchResult>;
  triggerDownload(downloadLocation: string): Promise<void>;
}
```

Unsplash is the first implementation. Adding Pexels or others later means implementing this interface and adding a config option — no tool or plugin rename needed.

## Key Design Decisions

### Constructor DI

`UnsplashClient` implements `StockPhotoProvider` and receives a `fetch` function via deps. Tools factory receives a `fetchImage` function. Single injection point through plugin constructor `deps` — no `globalThis.fetch` mocking needed in tests.

```typescript
interface StockPhotoDeps {
  fetch?: FetchFn;
  fetchImage?: (url: string) => Promise<string>;
}
```

### Configuration

```typescript
brain.register(
  stockPhotoPlugin({
    provider: "unsplash", // only option for now
    apiKey: process.env.UNSPLASH_ACCESS_KEY,
  }),
);
```

### Attribution Storage

Stored as `metadata.attribution` on the image entity:

```yaml
attribution:
  photographerName: "Jane Smith"
  photographerUrl: "https://unsplash.com/@janesmith"
  sourceUrl: "https://unsplash.com/photos/abc123"
```

Passes through existing frontmatter adapter without modifying `@brains/image` schema — extra metadata fields round-trip through YAML frontmatter.

### Download Tracking

`triggerDownload(downloadLocation)` fires in `stock-photo_select` per Unsplash API ToS. Fire-and-forget with error logged, never blocks image creation. Provider-specific — other providers may no-op.

### Graceful Degradation

`getTools()` returns `[]` when API key is absent, matching the Buttondown plugin pattern. Plugin registers but exposes no tools.

### Deduplication

Uses `metadata.sourceUrl` matching the photo's page URL on the provider (not the CDN image URL, which can change). Reuses existing image entity if found.

## Data Flow

```
User → stock-photo_search({ query, perPage })
  → provider.searchPhotos()
    → GET https://api.unsplash.com/search/photos?query=...&per_page=...
  → toolSuccess({ photos: [...candidates] })
  → User picks a photo

User → stock-photo_select({ photoId, downloadLocation, imageUrl, ... })
  → Check deduplication via entityService.listEntities("image", sourceUrl filter)
    → [match found] → return existing entity ID
    → [no match] → continue:
  → Promise.all([
      provider.triggerDownload(downloadLocation),  ← Unsplash ToS (fire-and-forget)
      fetchImage(imageUrl),                        ← fetchImageAsBase64 from @brains/utils
    ])
  → detectImageFormat + detectImageDimensions      ← from @brains/image
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

## API Key

From https://unsplash.com/developers — free tier: 50 req/hour (demo), production: 5000 req/hour.
