import { describe, expect, it } from "bun:test";
import {
  extractCoverImageId,
  setCoverImageId,
  extractOgImageId,
  setOgImageId,
} from "../src/lib/image-resolver";
import type { BaseEntity } from "@brains/entity-service";

// Helper to create mock entity with frontmatter
function createMockEntity(content: string): BaseEntity {
  return {
    id: "test-entity-1",
    entityType: "test",
    content,
    visibility: "public",
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

describe("extractOgImageId", () => {
  it("should extract ogImageId from frontmatter", () => {
    const entity = createMockEntity(`---
ogImageId: post-og-image
title: Test
---

# Test Content`);

    const result = extractOgImageId(entity);

    expect(result).toBe("post-og-image");
  });

  it("should return undefined when no ogImageId is present", () => {
    const entity = createMockEntity(`---
title: Test
---

# Test Content`);

    expect(extractOgImageId(entity)).toBeUndefined();
  });
});

describe("setOgImageId", () => {
  it("sets OG image ID on entity", () => {
    const entity = createMockEntity(`---
title: Test Post
---

Content here`);

    const result = setOgImageId(entity, "new-og-image");

    expect(result.id).toBe("test-entity-1");
    expect(extractOgImageId(result)).toBe("new-og-image");
  });

  it("removes OG image when null", () => {
    const entity = createMockEntity(`---
title: Test Post
ogImageId: old-image
---

Content here`);

    const result = setOgImageId(entity, null);

    expect(extractOgImageId(result)).toBeUndefined();
  });
});

describe("setCoverImageId", () => {
  it("sets cover image ID on entity", () => {
    const entity = createMockEntity(`---
title: Test Post
---

Content here`);

    const result = setCoverImageId(entity, "new-cover-image");

    expect(result.id).toBe("test-entity-1");
    expect(extractCoverImageId(result)).toBe("new-cover-image");
  });

  it("removes cover image when null", () => {
    const entity = createMockEntity(`---
title: Test Post
coverImageId: old-image
---

Content here`);

    const result = setCoverImageId(entity, null);

    expect(extractCoverImageId(result)).toBeUndefined();
  });

  it("preserves other entity properties", () => {
    const entity = {
      id: "test-123",
      entityType: "blog",
      content: `---
title: Test
---

Content`,
      metadata: { slug: "test-post" },
    };

    const result = setCoverImageId(entity, "cover-img");

    expect(result.id).toBe("test-123");
    expect(result.entityType).toBe("blog");
    expect(result.metadata).toEqual({ slug: "test-post" });
  });
});
