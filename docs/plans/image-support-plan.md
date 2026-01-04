# Plan: Add Image Support to Brain

## Overview

Add first-class image entity support with:

- **Image entity type** with metadata (title, alt, tags, dimensions)
- **Base64 storage**: Self-contained entities with encoded image data
- **CLI/MCP tools**: Upload, generate, list, get images
- **Template integration**: Resolve image IDs to URLs
- **Build-time extraction**: Extract to static files for production

## Design Decisions

| Decision         | Choice                      | Rationale                                           |
| ---------------- | --------------------------- | --------------------------------------------------- |
| Storage          | Base64 only                 | Self-contained entities, no external deps           |
| Content field    | `data:image/png;base64,...` | Single field with encoded data                      |
| Dimensions       | Required, auto-detected     | Always known, enables layout optimization           |
| Format           | Required, auto-detected     | Parsed from base64 header                           |
| Alt text         | Defaults to title           | Balance accessibility with low friction             |
| Build output     | Extract to `dist/images/`   | Static files, CDN caches naturally                  |
| Directory sync   | Binary ↔ base64 conversion | Git stores smaller binary, entity is self-contained |
| Embedding weight | 0 (skip)                    | Images don't benefit from text embeddings           |
| Field naming     | `coverImageId`              | Explicit entity reference                           |

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
- `fetchImageAsBase64(url)`: Fetch image from URL, return as data URL

### Step 4: Create Image Tools

**File:** `plugins/image/src/tools/index.ts`

Tools:

| Tool             | Purpose                                    | Inputs                             |
| ---------------- | ------------------------------------------ | ---------------------------------- |
| `image_upload`   | Create image from URL or base64 data       | `title`, `source`, `alt?`, `tags?` |
| `image_generate` | Generate image via AI (pluggable provider) | `prompt`, `title`, `tags?`         |
| `image_get`      | Retrieve image by ID                       | `id`                               |
| `image_list`     | List images with optional tag filter       | `tag?`, `limit?`                   |
| `image_update`   | Update image metadata                      | `id`, `title?`, `alt?`, `tags?`    |
| `image_describe` | AI-generate alt text from image content    | `id`                               |

**Upload tool accepts two source types:**

```typescript
image_upload({
  title: "My Image",
  source: "https://example.com/photo.jpg",  // External URL
  // OR
  source: "data:image/png;base64,iVBORw0...",  // Base64 data URL
  alt?: "Description",
  tags?: ["landscape", "cover"]
})
```

**Upload flow:**

```
If source starts with "http":
  1. Fetch image from URL
  2. Convert response to base64
  3. Auto-detect format from content-type or magic bytes
  4. Auto-detect dimensions from image header
  5. Store as base64 entity (self-contained)

If source starts with "data:":
  1. Parse data URL header for format
  2. Auto-detect dimensions from image header
  3. Set alt to title if not provided
  4. Store entity with base64 content
```

Either way, the stored entity contains base64 data (self-contained). URLs are just for import convenience.

**Describe flow:**

1. Retrieve image entity by ID
2. Send base64 image to AI vision model
3. AI generates descriptive alt text
4. Update entity with new alt text
5. Return generated alt text

### Step 5: Add Directory-Sync Support for Images

**File:** `plugins/directory-sync/src/lib/file-operations.ts`

Add image file handling:

```typescript
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

function isImageFile(path: string): boolean;
function readImageAsBase64(path: string): Promise<string>;
function writeImageFromBase64(path: string, dataUrl: string): Promise<void>;
```

**File:** `plugins/directory-sync/src/lib/directory-sync.ts`

**Import flow (binary → base64):**

```
brain-data/image/hero.png    # Binary file on disk

1. Detect image file by extension
2. Read binary file
3. Base64 encode → data URL
4. Auto-detect format from extension
5. Auto-detect width/height from image header
6. Generate defaults:
   - title: filename without extension ("hero")
   - alt: defaults to title
   - tags: empty
7. Create image entity with base64 content
```

**Export flow (base64 → binary):**

```
Image entity (base64 content)

1. Parse data URL → extract format and raw base64
2. Decode base64 → binary buffer
3. Write to brain-data/image/{slug}.{format}
```

**Post-import metadata workflow:**

```
1. Directory-sync imports hero.png with defaults
2. User (or AI) updates metadata:
   - image_update("hero", { alt: "A mountain at sunset" })
   - image_describe("hero") → AI generates alt text
3. Entity now has proper metadata
```

**Generate flow:**

1. Call AI image service with prompt (provider configured separately)
2. Receive base64 image
3. Auto-detect format/dimensions
4. Set alt to prompt
5. Create entity

### Step 6: Create Image Resolver

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

### Step 7: Update Site-Builder for Image Extraction

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

### Step 8: Update Schemas to Use coverImageId

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

### Step 9: Update Templates to Resolve Images

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

### Step 10: Register Plugin

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

| File                                                | Changes                       |
| --------------------------------------------------- | ----------------------------- |
| `plugins/directory-sync/src/lib/file-operations.ts` | Add image file read/write     |
| `plugins/directory-sync/src/lib/directory-sync.ts`  | Handle image import/export    |
| `plugins/site-builder/src/lib/build.ts`             | Add image extraction logic    |
| `plugins/blog/src/schemas/post.ts`                  | `coverImage` → `coverImageId` |
| `plugins/blog/src/schemas/series.ts`                | `coverImage` → `coverImageId` |
| `plugins/blog/src/templates/blog-post.tsx`          | Use resolveImage()            |
| `plugins/blog/src/templates/series-detail.tsx`      | Use resolveImage()            |
| `apps/professional-brain/brain.config.ts`           | Register imagePlugin          |
| `package.json` (root)                               | Add workspace reference       |

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

## Cross-Plugin Integration

Image generation is **AI-orchestrated** to avoid hard coupling between plugins:

- Plugins don't import or depend on each other
- AI agents use tools to orchestrate workflows
- If image plugin isn't installed, image tools simply aren't available

**Example workflow:**

```
User: "Create a blog post about hiking with a cover image"

AI Agent:
  1. Calls image_generate(prompt: "scenic mountain hiking trail at sunrise")
     → Returns { imageId: "img-abc123" }

  2. Calls post_create(
       title: "My Hiking Adventure",
       coverImageId: "img-abc123",
       content: "..."
     )
     → Creates post with image reference
```

**For programmatic use (pipelines, scripts):**

```typescript
const imageResult = await shell.executeTool("image_generate", {
  prompt: "...",
  title: "Cover Image",
});
const postResult = await shell.executeTool("post_create", {
  title: "My Post",
  coverImageId: imageResult.imageId,
});
```

## AI Evals

Evals ensure AI correctly orchestrates image generation:

### Tool Invocation Evals

| Eval                          | Verifies                                              |
| ----------------------------- | ----------------------------------------------------- |
| `image-generation-invocation` | AI calls `image_generate` when user requests image    |
| `image-upload-invocation`     | AI calls `image_upload` when user provides URL/base64 |
| `image-describe-invocation`   | AI calls `image_describe` when asked to add alt text  |
| `no-unnecessary-generation`   | AI doesn't generate images when not requested         |

### Workflow Evals

| Eval                   | Verifies                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `image-id-handoff`     | AI passes generated `imageId` to subsequent tools correctly |
| `cover-image-workflow` | AI generates image + creates post with `coverImageId`       |
| `multi-image-workflow` | AI handles multiple images in one request                   |

### Quality Evals

| Eval                   | Verifies                                       |
| ---------------------- | ---------------------------------------------- |
| `image-prompt-quality` | AI creates descriptive prompts for generation  |
| `alt-text-quality`     | AI provides meaningful alt text when specified |

### Example Eval Cases

```typescript
// Tool invocation eval
{
  name: "image-generation-invocation",
  input: "Create a cover image for my blog about travel",
  expectedToolCalls: [
    { tool: "image_generate", argsMatch: { prompt: /.+/ } }
  ]
}

// Workflow eval
{
  name: "cover-image-workflow",
  input: "Create a blog post about hiking with a cover image",
  expectedToolCalls: [
    { tool: "image_generate", argsMatch: { prompt: /hiking|mountain|trail/i } },
    { tool: "post_create", argsMatch: { coverImageId: "{{ref:0.imageId}}" } }
  ],
  verifyOrder: true
}

// Quality eval (LLM-as-judge)
{
  name: "image-prompt-quality",
  input: "Generate an image for a tech blog about AI",
  toolCall: "image_generate",
  judge: {
    criteria: "Prompt is descriptive, specific, and relevant to AI/technology",
    minScore: 0.7
  }
}
```

## Future Enhancements (Not in Scope)

- Sidecar metadata files (`.meta.yaml`) for directory-sync
- Obsidian reference compatibility (path ↔ ID translation)
- Image optimization/resizing on upload
- Specific AI image provider integration (DALL-E, Stable Diffusion)
- Image cropping/editing tools
- Local file import via CLI (read from disk path)
