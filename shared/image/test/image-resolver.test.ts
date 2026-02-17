import { describe, expect, it } from "bun:test";
import {
  resolveImage,
  resolveEntityCoverImage,
  extractCoverImageId,
} from "../src/lib/image-resolver";
import type { Image } from "../src/schemas/image";
import type { BaseEntity } from "@brains/entity-service";
import { createMockEntityService } from "@brains/test-utils";

// Minimal 1x1 pixel PNG (base64)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

const mockImageEntity: Image = {
  id: "hero-image",
  entityType: "image",
  content: TINY_PNG_DATA_URL,
  metadata: {
    title: "Hero Image",
    alt: "A hero image for the blog",
    format: "png",
    width: 1,
    height: 1,
  },
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  contentHash: "abc123",
};

describe("resolveImage", () => {
  it("should resolve an existing image entity by ID", async () => {
    const entityService = createMockEntityService({
      entityTypes: ["image"],
      returns: { getEntity: mockImageEntity },
    });

    const result = await resolveImage("hero-image", entityService);

    expect(result).not.toBeNull();
    expect(result?.url).toBe(TINY_PNG_DATA_URL);
    expect(result?.alt).toBe("A hero image for the blog");
    expect(result?.title).toBe("Hero Image");
    expect(result?.width).toBe(1);
    expect(result?.height).toBe(1);
  });

  it("should return null for non-existent image", async () => {
    const entityService = createMockEntityService({
      entityTypes: ["image"],
      returns: { getEntity: null },
    });

    const result = await resolveImage("non-existent", entityService);

    expect(result).toBeNull();
  });

  it("should call getEntity with correct parameters", async () => {
    const entityService = createMockEntityService({
      entityTypes: ["image"],
      returns: { getEntity: mockImageEntity },
    });

    await resolveImage("hero-image", entityService);

    expect(entityService.getEntity).toHaveBeenCalledWith("image", "hero-image");
  });
});

// Helper to create mock entity with frontmatter
function createMockEntity(content: string): BaseEntity {
  return {
    id: "test-entity-1",
    entityType: "test",
    content,
    metadata: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    contentHash: "def456",
  };
}

describe("extractCoverImageId", () => {
  it("should extract coverImageId from frontmatter", () => {
    const entity = createMockEntity(`---
coverImageId: hero-image
title: Test
---

# Test Content`);

    const result = extractCoverImageId(entity);

    expect(result).toBe("hero-image");
  });

  it("should return undefined when no coverImageId in frontmatter", () => {
    const entity = createMockEntity(`---
title: Test
---

# Test Content`);

    const result = extractCoverImageId(entity);

    expect(result).toBeUndefined();
  });

  it("should return undefined for content without frontmatter", () => {
    const entity = createMockEntity("# Just plain content");

    const result = extractCoverImageId(entity);

    expect(result).toBeUndefined();
  });

  it("should handle invalid frontmatter gracefully", () => {
    const entity = createMockEntity("---\ninvalid yaml: [unclosed");

    const result = extractCoverImageId(entity);

    expect(result).toBeUndefined();
  });
});

describe("resolveEntityCoverImage", () => {
  it("should resolve cover image from entity frontmatter", async () => {
    const entity = createMockEntity(`---
coverImageId: hero-image
---

# Test`);

    const entityService = createMockEntityService({
      entityTypes: ["image", "test"],
      returns: { getEntity: mockImageEntity },
    });

    const result = await resolveEntityCoverImage(entity, entityService);

    expect(result).not.toBeUndefined();
    expect(result?.url).toBe(TINY_PNG_DATA_URL);
    expect(result?.width).toBe(1);
    expect(result?.height).toBe(1);
  });

  it("should return undefined when no coverImageId in frontmatter", async () => {
    const entity = createMockEntity(`---
title: Test
---

# Test`);

    const entityService = createMockEntityService({
      entityTypes: ["image", "test"],
      returns: { getEntity: mockImageEntity },
    });

    const result = await resolveEntityCoverImage(entity, entityService);

    expect(result).toBeUndefined();
  });

  it("should return undefined when image entity does not exist", async () => {
    const entity = createMockEntity(`---
coverImageId: non-existent-image
---

# Test`);

    const entityService = createMockEntityService({
      entityTypes: ["image", "test"],
      returns: { getEntity: null },
    });

    const result = await resolveEntityCoverImage(entity, entityService);

    expect(result).toBeUndefined();
  });

  it("should return undefined for content without frontmatter", async () => {
    const entity = createMockEntity("# Just plain content");

    const entityService = createMockEntityService({
      entityTypes: ["image", "test"],
      returns: { getEntity: mockImageEntity },
    });

    const result = await resolveEntityCoverImage(entity, entityService);

    expect(result).toBeUndefined();
  });
});
