# Social Media Plugin Image Support Plan

## Overview

Add image support to social posts, enabling LinkedIn posts with attached images.

---

## Architecture Decision

**Use `coverImageId` pattern** (same as blog posts, projects, decks):

- Store `coverImageId` in frontmatter (references image entity)
- Image plugin's `set-cover` tool works automatically once adapter declares support
- LinkedIn publisher fetches image data and uploads to LinkedIn API

---

## Phase 1: Schema & Adapter Changes

### 1.1 Update Social Post Schema

**File**: `plugins/social-media/src/schemas/social-post.ts`

Add to `socialPostFrontmatterSchema`:

```typescript
coverImageId: z.string().optional().describe("Image entity ID for post image"),
```

Note: Do NOT add to metadata schema (keep metadata lean for DB queries).

### 1.2 Update Social Post Adapter

**File**: `plugins/social-media/src/adapters/social-post-adapter.ts`

Add property:

```typescript
public readonly supportsCoverImage = true;
```

---

## Phase 1.5: Auto-Generate Image Flag

### 1.5.1 Update Generation Job Schema

**File**: `plugins/social-media/src/handlers/generationHandler.ts`

Add to `generationJobSchema`:

```typescript
generateImage: z.boolean().optional().describe("Auto-generate cover image for post"),
```

### 1.5.2 Queue Image Generation After Post Creation

In `GenerationJobHandler.process()`, after creating the post entity:

```typescript
if (data.generateImage) {
  // Queue image generation job with target entity
  await this.context.jobs.enqueue(
    "image-generate",
    {
      prompt: `Social media graphic for: ${title}`,
      title: `${title} Image`,
      size: "1792x1024", // Landscape for social
      targetEntityType: "social-post",
      targetEntityId: result.entityId,
    },
    toolContext,
  );
}
```

The image plugin's job handler already supports `targetEntityType` and `targetEntityId` - it auto-attaches the image when generation completes.

---

## Phase 2: LinkedIn Client Image Upload

### 2.1 Add Image Upload Methods

**File**: `plugins/social-media/src/lib/linkedin-client.ts`

LinkedIn requires a 3-step process for images:

```typescript
// Step 1: Register upload to get upload URL
private async registerImageUpload(): Promise<{ uploadUrl: string; asset: string }>

// Step 2: Upload binary image data
private async uploadImageBinary(uploadUrl: string, imageData: Buffer): Promise<void>

// Step 3: Use asset URN in post
// (integrated into publish method)
```

### 2.2 Update Publish Method Signature

**File**: `plugins/social-media/src/lib/linkedin-client.ts`

Current:

```typescript
async publish(content: string, metadata: Record<string, unknown>): Promise<PublishResult>
```

Add optional image parameter:

```typescript
async publish(
  content: string,
  metadata: Record<string, unknown>,
  imageData?: { buffer: Buffer; mimeType: string }
): Promise<PublishResult>
```

### 2.3 Update Post Body Structure

When image provided, change:

```typescript
shareMediaCategory: "NONE"; // current
```

To:

```typescript
shareMediaCategory: imageData ? "IMAGE" : "NONE",
media: imageData ? [{
  status: "READY",
  media: assetUrn,  // from registerImageUpload
}] : undefined,
```

---

## Phase 3: Publish Handler Integration

### 3.1 Update PublishExecuteHandler

**File**: `plugins/social-media/src/handlers/publishExecuteHandler.ts`

Before calling `provider.publish()`:

1. Check if `coverImageId` exists in frontmatter
2. If yes, fetch image entity via entity service
3. Get image binary data from image entity
4. Pass to `provider.publish()`

```typescript
// Pseudo-code addition
let imageData: { buffer: Buffer; mimeType: string } | undefined;
if (parsed.frontmatter.coverImageId) {
  const image = await this.context.entityService.getEntity(
    "image",
    parsed.frontmatter.coverImageId,
  );
  if (image) {
    imageData = this.extractImageData(image);
  }
}
const result = await provider.publish(parsed.content, post.metadata, imageData);
```

---

## Phase 4: Update Tests

### 4.1 Schema Tests

- Test `coverImageId` field in frontmatter validation

### 4.2 Adapter Tests

- Test `supportsCoverImage = true`

### 4.3 LinkedIn Client Tests

- Mock image upload flow
- Test with and without images

### 4.4 Publish Handler Tests

- Test image fetch and pass-through

---

## Critical Files

| File                                                         | Change                                    |
| ------------------------------------------------------------ | ----------------------------------------- |
| `plugins/social-media/src/schemas/social-post.ts`            | Add `coverImageId` to frontmatter         |
| `plugins/social-media/src/adapters/social-post-adapter.ts`   | Add `supportsCoverImage = true`           |
| `plugins/social-media/src/handlers/generationHandler.ts`     | Add `generateImage` flag, queue image job |
| `plugins/social-media/src/lib/linkedin-client.ts`            | Add image upload methods                  |
| `plugins/social-media/src/handlers/publishExecuteHandler.ts` | Fetch image, pass to provider             |
| `shared/image/src/image-adapter.ts`                          | May need method to extract binary         |

---

## Usage Flow (After Implementation)

### Option A: Auto-generate image with post (recommended)

```bash
# Single command - creates post AND queues image generation
social-media_generate --prompt "Launch announcement" --generateImage true
# Creates post + image auto-attaches when ready

# Publish (waits for image or publishes without if not ready)
social-media_publish --id linkedin-launch-announcement-20260114
```

### Option B: Manual image attachment

```bash
# 1. Create social post
social-media_generate --prompt "Launch announcement"

# 2. Attach image separately
image_set-cover --entityType social-post --entityId linkedin-launch-announcement-20260114 --generate true
# Or use existing image:
image_set-cover --entityType social-post --entityId linkedin-launch-announcement-20260114 --imageId my-hero-image

# 3. Publish
social-media_publish --id linkedin-launch-announcement-20260114
```

---

## Verification

1. Run `bun test plugins/social-media` - all tests pass
2. Run `bun run typecheck` - no type errors
3. Manual test:
   - Create social post with `social-media_generate`
   - Attach image with `image_set-cover`
   - Verify frontmatter contains `coverImageId`
   - Publish and verify LinkedIn post includes image

---

## Dependencies

- Image plugin must be installed (for `set-cover` tool)
- `shared/image` package (for image data extraction)
- LinkedIn API credentials with `w_member_social` scope
