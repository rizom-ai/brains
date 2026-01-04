# Plan: Add Image Support to Brain

## Overview

Add first-class image entity support with:

- **Image entity type** with metadata (title, alt, tags, dimensions)
- **Dual storage**: Base64-encoded content OR external URL references
- **Directory-sync integration**: Binary file import/export with sidecar metadata
- **CLI/MCP tools**: Upload, list, get images
- **Template integration**: Resolve image IDs to URLs in templates

## Design Decisions

| Decision            | Choice                             | Rationale                                 |
| ------------------- | ---------------------------------- | ----------------------------------------- |
| Storage             | Hybrid (base64 OR URL)             | Self-contained entities with CDN support  |
| Metadata format     | YAML sidecar (`.meta.yaml`)        | Binary files can't have frontmatter       |
| Content field       | `data:image/...;base64,...` or URL | Single field, type detection by prefix    |
| Directory structure | `brain-data/image/`                | Consistent with other entity types        |
| Embedding weight    | 0 (skip)                           | Images don't benefit from text embeddings |

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
  alt: z.string(),
  format: z.string(), // "png", "jpg", "webp", "gif", "svg"
  width: z.number().optional(),
  height: z.number().optional(),
  source: z.enum(["base64", "url"]),
  tags: z.array(z.string()).optional(),
});
```

**Content field stores**: `data:image/png;base64,{data}` OR `https://cdn.example.com/image.png`

### Step 2: Implement Image Adapter

**File:** `plugins/image/src/adapters/image-adapter.ts`

Key methods:

- `toMarkdown()`: Returns content as-is (base64 data URL or external URL)
- `fromMarkdown()`: Detects source type, extracts format
- `extractMetadata()`: Returns metadata object
- `createBase64Content()`: Builds data URL from raw base64
- `isBase64()` / `isUrl()`: Type detection helpers

### Step 3: Modify Directory-Sync for Binary Files

**File:** `plugins/directory-sync/src/lib/file-operations.ts`

Add methods:

- `isImageFile(path)`: Check extension (.png, .jpg, .webp, .gif, .svg)
- `readImageEntity(path)`: Read binary → base64, parse sidecar metadata
- `writeImageEntity(entity)`: Convert base64 → binary, write sidecar
- `getAllImageFiles()`: List image files in sync directory

**Sidecar format** (`image-name.png.meta.yaml`):

```yaml
title: My Image
alt: Description for accessibility
format: png
width: 800
height: 600
tags:
  - photo
  - landscape
```

### Step 4: Update Directory-Sync Import/Export

**File:** `plugins/directory-sync/src/lib/directory-sync.ts`

Modify `importFile()`:

- Check if file is image → call `importImageFile()`
- Skip `.meta.yaml` files (handled with image)

Add `importImageFile()`:

- Read binary + sidecar metadata
- Create image entity with base64 content
- Upsert to database

Modify `exportEntities()`:

- Handle image entities specially
- Write binary file + sidecar metadata

### Step 5: Create Image Tools

**File:** `plugins/image/src/tools/index.ts`

Tools:

- `image_upload`: Create image from base64 data or URL
- `image_get`: Retrieve image by ID
- `image_list`: List images with optional tag filter

### Step 6: Create Image Resolver

**File:** `plugins/image/src/lib/image-resolver.ts`

```typescript
async function resolveImage(
  reference: string, // Image ID, external URL, or data URL
  entityService: IEntityService,
): Promise<ResolvedImage | null>;
```

Returns `{ url, alt, title, width, height }` for templates to use.

### Step 7: Update Templates to Resolve Images

**Files to update:**

- `plugins/blog/src/templates/blog-post.tsx`
- `plugins/blog/src/templates/series-detail.tsx`
- `plugins/portfolio/src/templates/project.tsx` (if exists)

Use `resolveImage()` to convert coverImage field (ID or URL) to displayable URL.

### Step 8: Register Plugin

**File:** `apps/professional-brain/brain.config.ts`

Add `imagePlugin()` to plugins array.

## Files to Create

| File                                          | Purpose            |
| --------------------------------------------- | ------------------ |
| `plugins/image/package.json`                  | Package definition |
| `plugins/image/tsconfig.json`                 | TypeScript config  |
| `plugins/image/src/index.ts`                  | Exports            |
| `plugins/image/src/plugin.ts`                 | ImagePlugin class  |
| `plugins/image/src/config.ts`                 | Config schema      |
| `plugins/image/src/schemas/image.ts`          | Entity schema      |
| `plugins/image/src/adapters/image-adapter.ts` | Entity adapter     |
| `plugins/image/src/tools/index.ts`            | CLI/MCP tools      |
| `plugins/image/src/lib/image-resolver.ts`     | Resolve image refs |

## Files to Modify

| File                                                | Changes                    |
| --------------------------------------------------- | -------------------------- |
| `plugins/directory-sync/src/lib/file-operations.ts` | Add image file handling    |
| `plugins/directory-sync/src/lib/directory-sync.ts`  | Handle image import/export |
| `plugins/blog/src/templates/blog-post.tsx`          | Resolve coverImage         |
| `apps/professional-brain/brain.config.ts`           | Register imagePlugin       |
| `package.json` (root)                               | Add workspace reference    |

## Backward Compatibility

Existing `coverImage` fields store URL strings. The new system is backward compatible:

- External URLs continue to work (passed through by resolver)
- Image entity IDs are a new option
- No data migration required

## Directory Structure Example

```
brain-data/
├── post/
│   └── my-blog.md           # coverImage: "hero-image" (image ID)
└── image/
    ├── hero-image.png       # Binary image file
    └── hero-image.png.meta.yaml  # Sidecar metadata
```
