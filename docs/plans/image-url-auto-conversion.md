# Plan: Auto-Convert Image URLs to Entity References in Directory-Sync

## Goal

When a user writes `coverImage: https://example.com/photo.jpg` in blog post frontmatter, directory-sync automatically:

1. Fetches the image from the URL
2. Creates an image entity
3. Rewrites the source file with `coverImageId: <entity-id>`

## Implementation Approach

### Phase 1: coverImage Frontmatter (Core Feature)

#### 1. Add `sourceUrl` to Image Metadata Schema

**File:** `plugins/image/src/schemas/image.ts`

Add optional `sourceUrl` field for deduplication:

```typescript
metadata: z.object({
  title: z.string(),
  alt: z.string(),
  format: imageFormatSchema,
  width: z.number(),
  height: z.number(),
  sourceUrl: z.string().url().optional(), // NEW: original URL for dedup
}),
```

#### 2. Create FrontmatterImageConverter Utility

**New file:** `plugins/directory-sync/src/lib/frontmatter-image-converter.ts`

Responsibilities:

- Parse frontmatter to detect `coverImage` URLs (using `isHttpUrl()`)
- Skip if `coverImageId` already exists
- Query existing images by `sourceUrl` for deduplication
- Fetch image using `fetchImageAsBase64()` if not found
- Create image entity via `entityService.createEntity()`
- Rewrite source file: replace `coverImage` with `coverImageId`

```typescript
export class FrontmatterImageConverter {
  constructor(
    private entityService: IEntityService,
    private logger: Logger,
    private syncPath: string,
  ) {}

  supportsConversion(entityType: string): boolean {
    return entityType === "post"; // Extend later for portfolio, decks
  }

  async convertImageUrls(
    content: string,
    entityType: string,
    filePath: string,
  ): Promise<{ content: string; converted: boolean; imageId?: string }>;
}
```

#### 3. Integrate with Directory-Sync Import

**File:** `plugins/directory-sync/src/lib/directory-sync.ts`

In `processEntityImport()`, before deserializing entity:

```typescript
// Convert image URLs before processing
if (this.imageConverter.supportsConversion(rawEntity.entityType)) {
  const result = await this.imageConverter.convertImageUrls(
    rawEntity.content,
    rawEntity.entityType,
    filePath,
  );
  if (result.converted) {
    rawEntity.content = result.content;
    // Rewrite source file
    await this.fileOperations.writeEntityRaw(filePath, result.content);
  }
}
```

#### 4. Add Dependency

**File:** `plugins/directory-sync/package.json`

```json
"dependencies": {
  "@brains/image": "workspace:*"
}
```

### Phase 2: Inline Markdown Images

Convert `![alt](https://url)` in post body to `![alt](entity://image/entity-id)`.

#### Reference Syntax

Use `entity://image/{id}` format for image entity references in markdown:

- Clear protocol identifier distinguishes from regular URLs
- Consistent with URI conventions
- Easy to parse with regex: `/entity:\/\/image\/([a-zA-Z0-9-]+)/`

#### Two-Phase Processing

**Import Time (directory-sync):**

1. Parse markdown body for `![alt](https://...)` patterns
2. For each HTTP URL:
   - Check deduplication via `sourceUrl` metadata
   - Fetch image using `fetchImageAsBase64()`
   - Create image entity with `sourceUrl` for dedup
   - Replace URL with `entity://image/{id}` in markdown
3. Rewrite source file with converted references

**Render Time (datasource):**

1. After parsing post content, scan body for `entity://image/{id}` references
2. Batch-fetch all referenced image entities
3. Replace references with resolved data URLs
4. Return post with resolved inline images

#### New Files for Phase 2

**1. `plugins/directory-sync/src/lib/markdown-image-converter.ts`**

```typescript
export class MarkdownImageConverter {
  constructor(
    private entityService: IEntityService,
    private logger: Logger,
  ) {}

  /**
   * Find all markdown image URLs in content body (after frontmatter)
   * Returns array of { fullMatch, alt, url, startIndex }
   */
  findImageUrls(markdownBody: string): MarkdownImage[];

  /**
   * Convert all HTTP image URLs to entity references
   * Creates entities and rewrites content
   */
  async convertInlineImages(
    content: string, // Full file content with frontmatter
  ): Promise<{ content: string; converted: string[]; failed: string[] }>;
}
```

**2. `plugins/blog/src/lib/image-reference-resolver.ts`**

```typescript
export class ImageReferenceResolver {
  constructor(
    private entityService: IEntityService,
    private logger: Logger,
  ) {}

  /**
   * Find all entity://image/{id} references in markdown
   */
  findImageReferences(markdown: string): ImageReference[];

  /**
   * Resolve all image references to data URLs
   * Batch-fetches entities for efficiency
   */
  async resolveReferences(markdown: string): Promise<string>;
}
```

#### Integration Points

**Directory-Sync (import time):**

```typescript
// In FrontmatterImageConverter.convertImageUrls()
// After frontmatter conversion, also convert inline images
if (this.markdownImageConverter) {
  const inlineResult =
    await this.markdownImageConverter.convertInlineImages(content);
  content = inlineResult.content;
}
```

**Blog Datasource (render time):**

```typescript
// In parsePostData() or fetchSinglePost()
// After parsing markdown, resolve image references
post.body = await this.imageResolver.resolveReferences(post.body);
```

#### Regex Patterns

**Find markdown images with HTTP URLs:**

```typescript
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
```

**Find entity references:**

```typescript
const ENTITY_IMAGE_REGEX = /entity:\/\/image\/([a-zA-Z0-9-]+)/g;
```

#### Example Transformation

**Before (source file):**

```markdown
---
title: My Post
coverImage: https://example.com/hero.jpg
---

Here's a diagram:

![Architecture diagram](https://example.com/arch.png)

And another image:

![Photo](https://cdn.images.com/photo.jpg)
```

**After (converted file):**

```markdown
---
title: My Post
coverImageId: hero-abc123
---

Here's a diagram:

![Architecture diagram](entity://image/arch-def456)

And another image:

![Photo](entity://image/photo-ghi789)
```

**Rendered output (in template):**
All `entity://image/{id}` references resolved to data URLs.

## Key Files

### Phase 1

| File                                                              | Action                              |
| ----------------------------------------------------------------- | ----------------------------------- |
| `plugins/image/src/schemas/image.ts`                              | Add `sourceUrl` to metadata         |
| `plugins/directory-sync/src/lib/frontmatter-image-converter.ts`   | **CREATE** - frontmatter conversion |
| `plugins/directory-sync/src/lib/directory-sync.ts`                | Add converter call in import        |
| `plugins/directory-sync/package.json`                             | Add @brains/image dependency        |
| `plugins/directory-sync/test/frontmatter-image-converter.test.ts` | **CREATE** - unit tests             |

### Phase 2

| File                                                           | Action                                 |
| -------------------------------------------------------------- | -------------------------------------- |
| `plugins/directory-sync/src/lib/markdown-image-converter.ts`   | **CREATE** - inline image conversion   |
| `plugins/blog/src/lib/image-reference-resolver.ts`             | **CREATE** - resolve entity references |
| `plugins/blog/src/datasources/blog-datasource.ts`              | Integrate resolver in post parsing     |
| `plugins/directory-sync/test/markdown-image-converter.test.ts` | **CREATE** - unit tests                |
| `plugins/blog/test/image-reference-resolver.test.ts`           | **CREATE** - unit tests                |

## Deduplication Logic

```typescript
async findExistingImage(sourceUrl: string): Promise<string | null> {
  const images = await this.entityService.listEntities("image", {
    filter: { metadata: { sourceUrl } },
    limit: 1,
  });
  return images[0]?.id ?? null;
}
```

## Edge Cases

### Phase 1

1. **Already converted**: Skip if `coverImageId` exists
2. **Invalid URL**: Log warning, keep original `coverImage`
3. **Fetch failure**: Log warning, keep original `coverImage`
4. **Circular sync prevention**: Track recently-rewritten files, skip re-processing

### Phase 2

1. **Mixed content**: Some images already converted, some not
2. **No images**: Post with no inline images should pass through unchanged
3. **Nested markdown**: Images inside code blocks should NOT be converted
4. **Broken image links**: Failed fetches should keep original URL (graceful degradation)
5. **Missing entity at render**: Log warning, render placeholder or original reference
6. **Large posts**: Many images in single post - batch entity creation for efficiency

## Test Cases

### Phase 1: Frontmatter Conversion

1. Basic conversion: URL → entity + file rewrite
2. Skip if already has `coverImageId`
3. Deduplication: same URL across posts uses same image
4. Invalid URL handling
5. Fetch failure handling

### Phase 2: Inline Image Conversion

1. Convert single inline image URL to entity reference
2. Convert multiple inline images in one post
3. Skip images inside code blocks (```or inline`)
4. Handle mixed state: some converted, some not
5. Deduplication across inline images (same URL = same entity)
6. Resolve entity references at render time
7. Handle missing entity gracefully at render time
8. Batch entity fetching for efficiency

## Implementation Order

### Phase 1 (coverImage frontmatter)

1. Add `sourceUrl` to image metadata schema
2. Create `FrontmatterImageConverter` class with tests
3. Integrate converter into directory-sync import flow
4. Add @brains/image dependency to directory-sync

### Phase 2 (inline markdown images)

1. Create `MarkdownImageConverter` class with tests (reuse dedup logic from Phase 1)
2. Integrate inline converter into `FrontmatterImageConverter`
3. Create `ImageReferenceResolver` class with tests
4. Integrate resolver into `BlogDataSource`
5. Optionally extend to `ProjectDataSource` for portfolio
