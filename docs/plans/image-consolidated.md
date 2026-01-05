# Plan: Image Support - Consolidated Outstanding Work

## Status Summary

| Feature                                   | Status                  |
| ----------------------------------------- | ----------------------- |
| Image plugin core                         | Complete                |
| image_upload, image_get, image_list tools | Complete                |
| Binary image import (directory-sync)      | Complete                |
| coverImageUrl → coverImageId conversion   | Complete (but blocking) |
| **Non-blocking image extraction**         | **TODO - Priority**     |
| Inline markdown images                    | TODO                    |
| image_describe tool (AI alt text)         | TODO                    |
| image_update tool                         | TODO                    |
| Site-builder image extraction             | TODO                    |

---

## Phase 1: Non-Blocking Image Extraction (PRIORITY)

### Problem

Currently `processEntityImport()` blocks on `fetchImageAsBase64(url)` - 1-30+ seconds per image.

### Solution

Use job queue pattern (like topics/summary) to process images asynchronously.

### Implementation Steps

#### 1.1 Create ImageConversionJobHandler

**New file:** `plugins/directory-sync/src/handlers/image-conversion-handler.ts`

```typescript
interface ImageConversionJobData {
  filePath: string;
  sourceUrl: string;
  postTitle: string;
  postSlug: string;
  customAlt?: string;
}

export class ImageConversionJobHandler
  implements IJobHandler<ImageConversionJobData>
{
  async process(
    data,
    jobId,
    progressReporter,
  ): Promise<{ imageId: string; success: boolean }>;
}
```

Handler responsibilities:

- Fetch image from URL (async)
- Create image entity with `{slug}-cover` naming
- Re-read file, replace `coverImageUrl` with `coverImageId`
- Write updated content back
- Graceful error handling

#### 1.2 Refactor FrontmatterImageConverter

**File:** `plugins/directory-sync/src/lib/frontmatter-image-converter.ts`

Split into:

- `detectCoverImageUrl(content)`: Sync - parse and return URL if present
- `convertCoverImage(data)`: Async - actual conversion (used by handler)

#### 1.3 Register Handler

**File:** `plugins/directory-sync/src/plugin.ts`

```typescript
context.registerJobHandler("image-convert", new ImageConversionJobHandler(...));
```

#### 1.4 Queue Instead of Block

**File:** `plugins/directory-sync/src/lib/directory-sync.ts`

Replace blocking call with job enqueue:

```typescript
const imageUrl = this.imageConverter.detectCoverImageUrl(content);
if (imageUrl) {
  await context.enqueueJob("image-convert", { filePath, sourceUrl: imageUrl, ... });
}
// Continue immediately - no waiting
```

### Key Files

| File                                                                    | Action           |
| ----------------------------------------------------------------------- | ---------------- |
| `plugins/directory-sync/src/handlers/image-conversion-handler.ts`       | **CREATE**       |
| `plugins/directory-sync/src/lib/frontmatter-image-converter.ts`         | Refactor         |
| `plugins/directory-sync/src/lib/directory-sync.ts`                      | Queue job        |
| `plugins/directory-sync/src/plugin.ts`                                  | Register handler |
| `plugins/directory-sync/test/handlers/image-conversion-handler.test.ts` | **CREATE**       |

---

## Phase 2: Inline Markdown Images

Convert `![alt](https://url)` → `![alt](entity://image/{id})` in post body.

### 2.1 MarkdownImageConverter

**New file:** `plugins/directory-sync/src/lib/markdown-image-converter.ts`

- Find `![alt](https://...)` patterns (skip code blocks)
- Queue conversion jobs for each URL
- Replace with `entity://image/{id}`

### 2.2 ImageReferenceResolver

**New file:** `plugins/blog/src/lib/image-reference-resolver.ts`

At render time:

- Find `entity://image/{id}` references
- Batch-fetch image entities
- Replace with data URLs

### Key Files

| File                                                         | Action             |
| ------------------------------------------------------------ | ------------------ |
| `plugins/directory-sync/src/lib/markdown-image-converter.ts` | **CREATE**         |
| `plugins/blog/src/lib/image-reference-resolver.ts`           | **CREATE**         |
| `plugins/blog/src/datasources/blog-datasource.ts`            | Integrate resolver |

---

## Phase 3: Image Tools

### 3.1 image_describe

**File:** `plugins/image/src/tools/index.ts`

AI-generate alt text from image content:

1. Retrieve image entity
2. Send base64 to vision model
3. Generate descriptive alt text
4. Update entity metadata

### 3.2 image_update

**File:** `plugins/image/src/tools/index.ts`

Update image metadata (title, alt, tags):

```typescript
image_update({ id, title?, alt?, tags? })
```

---

## Phase 4: Site-Builder Image Extraction

### Problem

Production builds shouldn't inline base64 images (large HTML, no caching).

### Solution

At build time:

1. Collect all referenced image entities
2. Extract base64 → write to `dist/images/{id}.{format}`
3. Templates use `/images/{id}.{format}` paths

**File:** `plugins/site-builder/src/lib/build.ts`

```typescript
// During build
const imageMap = await extractImagesToStatic(imageIds, outputDir);
// Templates receive imageMap for URL resolution
```

---

## Implementation Order

1. **Phase 1.1-1.4**: Non-blocking extraction (immediate priority)
2. **Phase 2**: Inline markdown images
3. **Phase 3**: image_describe, image_update tools
4. **Phase 4**: Site-builder extraction

---

## Edge Cases

| Case                         | Handling                       |
| ---------------------------- | ------------------------------ |
| File changed before job runs | Re-read file in handler        |
| Duplicate jobs for same URL  | Job queue deduplication        |
| Conversion failure           | Log warning, keep original URL |
| Already converted            | Skip if `coverImageId` exists  |
| Images in code blocks        | Skip (regex excludes)          |
| Missing entity at render     | Log warning, use placeholder   |
