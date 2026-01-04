# Plan: Add Image Support to Brain

## Overview

Add first-class image entity support with:

- **Image entity type** with metadata (title, alt, tags, dimensions)
- **Base64 storage**: Self-contained entities with encoded image data
- **CLI/MCP tools**: Upload, generate, list, get images
- **Template integration**: Resolve image IDs to URLs
- **Build-time extraction**: Extract to static files for production

## Design Decisions

| Decision         | Choice                      | Rationale                                 |
| ---------------- | --------------------------- | ----------------------------------------- |
| Storage          | Base64 only                 | Self-contained entities, no external deps |
| Content field    | `data:image/png;base64,...` | Single field with encoded data            |
| Dimensions       | Required, auto-detected     | Always known, enables layout optimization |
| Format           | Required, auto-detected     | Parsed from base64 header                 |
| Alt text         | Defaults to title           | Balance accessibility with low friction   |
| Build output     | Extract to `dist/images/`   | Static files, CDN caches naturally        |
| Directory sync   | None                        | Images managed via tools only             |
| Embedding weight | 0 (skip)                    | Images don't benefit from text embeddings |
| Field naming     | `coverImageId`              | Explicit entity reference                 |

## Implementation Steps

### Step 1: Create Image Plugin Package

**New files in `plugins/image/`**

```
plugins/image/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── plugin.ts
    ├── config.ts
    ├── schemas/image.ts
    ├── adapters/image-adapter.ts
    ├── tools/index.ts
    └── lib/
        ├── image-utils.ts
        └── image-resolver.ts
```

**Image Schema** (`schemas/image.ts`):

```typescript
export const imageMetadataSchema = z.object({
  title: z.string(),
  alt: z.string(), // Defaults to title on upload
  format: z.string(), // Auto-detected: "png", "jpg", "webp", "gif", "svg"
  width: z.number(), // Auto-detected
  height: z.number(), // Auto-detected
  tags: z.array(z.string()).optional(),
});
```

**Content field stores**: `data:image/png;base64,{data}`

### Step 2: Implement Image Adapter

**File:** `plugins/image/src/adapters/image-adapter.ts`

Key methods:

- `toMarkdown()`: Returns content as-is (base64 data URL)
- `fromMarkdown()`: Parses data URL, extracts format
- `extractMetadata()`: Returns metadata object

### Step 3: Implement Image Utils

**File:** `plugins/image/src/lib/image-utils.ts`

Utility functions:

- `parseDataUrl(content)`: Extract format and raw base64 from data URL
- `createDataUrl(base64, format)`: Build data URL from raw base64
- `detectImageDimensions(base64)`: Parse image header to get width/height
- `detectImageFormat(base64)`: Detect format from magic bytes

### Step 4: Create Image Tools

**File:** `plugins/image/src/tools/index.ts`

Tools:

| Tool             | Purpose                                    | Inputs                           |
| ---------------- | ------------------------------------------ | -------------------------------- |
| `image_upload`   | Create image from base64 data              | `title`, `data`, `alt?`, `tags?` |
| `image_generate` | Generate image via AI (pluggable provider) | `prompt`, `title`, `tags?`       |
| `image_get`      | Retrieve image by ID                       | `id`                             |
| `image_list`     | List images with optional tag filter       | `tag?`, `limit?`                 |

**Upload flow:**

1. Receive base64 data
2. Auto-detect format from data URL header
3. Auto-detect dimensions from image header
4. Set alt to title if not provided
5. Create entity with metadata and content

**Generate flow:**

1. Call AI image service with prompt (provider configured separately)
2. Receive base64 image
3. Auto-detect format/dimensions
4. Set alt to prompt
5. Create entity

### Step 5: Create Image Resolver

**File:** `plugins/image/src/lib/image-resolver.ts`

```typescript
interface ResolvedImage {
  url: string; // Data URL or static file path
  alt: string;
  title: string;
  width: number;
  height: number;
}

async function resolveImage(
  imageId: string,
  entityService: IEntityService,
): Promise<ResolvedImage | null>;
```

Looks up image entity by ID, returns structured data for templates.

### Step 6: Update Site-Builder for Image Extraction

**File:** `plugins/site-builder/src/lib/build.ts` (or similar)

At build time:

1. Collect all image entities referenced by built pages
2. Extract base64 → write to `dist/images/{id}.{format}`
3. Return mapping of image IDs to static paths
4. Templates use static paths instead of data URLs in production

**Output structure:**

```
dist/
├── images/
│   ├── hero-image.png
│   └── profile-photo.jpg
├── blog/
│   └── my-post/
│       └── index.html  # <img src="/images/hero-image.png">
```

### Step 7: Update Schemas to Use coverImageId

**Files to update:**

- `plugins/blog/src/schemas/post.ts`
- `plugins/blog/src/schemas/series.ts`
- `plugins/decks/src/schemas/deck.ts` (if applicable)
- `plugins/social-media/src/schemas/social-post.ts` (if applicable)

Change:

```typescript
// Before
coverImage: z.string().optional();

// After
coverImageId: z.string().optional();
```

### Step 8: Update Templates to Resolve Images

**Files to update:**

- `plugins/blog/src/templates/blog-post.tsx`
- `plugins/blog/src/templates/series-detail.tsx`

Use `resolveImage()` to convert `coverImageId` to image data:

```tsx
const coverImage = post.coverImageId
  ? await resolveImage(post.coverImageId, entityService)
  : null;

// In template:
{
  coverImage && (
    <img
      src={coverImage.url}
      alt={coverImage.alt}
      width={coverImage.width}
      height={coverImage.height}
    />
  );
}
```

### Step 9: Register Plugin

**File:** `apps/professional-brain/brain.config.ts`

Add `imagePlugin()` to plugins array.

## Files to Create

| File                                          | Purpose                    |
| --------------------------------------------- | -------------------------- |
| `plugins/image/package.json`                  | Package definition         |
| `plugins/image/tsconfig.json`                 | TypeScript config          |
| `plugins/image/src/index.ts`                  | Exports                    |
| `plugins/image/src/plugin.ts`                 | ImagePlugin class          |
| `plugins/image/src/config.ts`                 | Config schema              |
| `plugins/image/src/schemas/image.ts`          | Entity schema              |
| `plugins/image/src/adapters/image-adapter.ts` | Entity adapter             |
| `plugins/image/src/tools/index.ts`            | CLI/MCP tools              |
| `plugins/image/src/lib/image-utils.ts`        | Base64/dimension utilities |
| `plugins/image/src/lib/image-resolver.ts`     | Resolve image refs         |

## Files to Modify

| File                                           | Changes                       |
| ---------------------------------------------- | ----------------------------- |
| `plugins/site-builder/src/lib/build.ts`        | Add image extraction logic    |
| `plugins/blog/src/schemas/post.ts`             | `coverImage` → `coverImageId` |
| `plugins/blog/src/schemas/series.ts`           | `coverImage` → `coverImageId` |
| `plugins/blog/src/templates/blog-post.tsx`     | Use resolveImage()            |
| `plugins/blog/src/templates/series-detail.tsx` | Use resolveImage()            |
| `apps/professional-brain/brain.config.ts`      | Register imagePlugin          |
| `package.json` (root)                          | Add workspace reference       |

## Build Flow

```
Development:
  Entity (base64) → Template → <img src="data:image/png;base64,...">

Production build:
  Entity (base64) → Extract → dist/images/hero.png
  Template → <img src="/images/hero.png">

Deploy:
  dist/ → Bunny CDN (images cached at edge)
```

## Future Enhancements (Not in Scope)

- Directory-sync for image files (sidecar metadata)
- Image optimization/resizing on upload
- Specific AI image provider integration (DALL-E, Stable Diffusion)
- Image cropping/editing tools
