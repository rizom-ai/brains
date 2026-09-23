import { describe, expect, it } from "bun:test";
import {
  extractCoverImageId,
  setCoverImageId,
  extractOgImageId,
  setOgImageId,
} from "../src/lib/image-resolver";

describe("image reference frontmatter", () => {
  it("extracts cover and OG references without resolving image bytes", () => {
    const entity = {
      content:
        "---\ncoverImageId: hero-image\nogImageId: post-og-image\ntitle: Test\n---\n\n# Test Content",
    };
    expect(extractCoverImageId(entity)).toBe("hero-image");
    expect(extractOgImageId(entity)).toBe("post-og-image");
  });
  it.each([
    "---\ntitle: Test\n---\n\n# Content",
    "# Just plain content",
    "---\ninvalid yaml: [unclosed",
    "---\ncoverImageId: 42\nogImageId: false\n---\nContent",
  ])("does not invent image references: %s", (content) => {
    expect(extractCoverImageId({ content })).toBeUndefined();
    expect(extractOgImageId({ content })).toBeUndefined();
  });
  it("sets and removes cover references, preserving other entity properties", () => {
    const entity = {
      id: "test-123",
      entityType: "post",
      content: "---\ntitle: Test\n---\n\nContent",
      metadata: { slug: "test-post" },
    };
    const result = setCoverImageId(entity, "new-cover-image");
    expect(extractCoverImageId(result)).toBe("new-cover-image");
    expect(result.id).toBe(entity.id);
    expect(result.entityType).toBe(entity.entityType);
    expect(result.metadata).toEqual(entity.metadata);
    expect(extractCoverImageId(entity)).toBeUndefined();
    expect(extractCoverImageId(setCoverImageId(result, null))).toBeUndefined();
  });
  it("sets and removes OG references without disturbing the cover", () => {
    const entity = {
      id: "test-123",
      content: "---\ntitle: Test\ncoverImageId: hero\n---\n\nContent",
    };
    const result = setOgImageId(entity, "new-og-image");
    expect(result.id).toBe(entity.id);
    expect(extractOgImageId(result)).toBe("new-og-image");
    const removed = setOgImageId(result, null);
    expect(extractOgImageId(removed)).toBeUndefined();
    expect(extractCoverImageId(removed)).toBe("hero");
  });
});
