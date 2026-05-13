import { describe, it, expect } from "bun:test";
import {
  extractMarkdownImages,
  getCoverImageId,
  setCoverImageId,
} from "./markdown-images";

describe("markdown image utilities", () => {
  describe("extractMarkdownImages", () => {
    it("extracts markdown images", () => {
      const images = extractMarkdownImages(
        'Text\n\n![Alt text](https://example.com/image.png "Title")\n',
      );

      expect(images).toHaveLength(1);
      expect(images[0]).toMatchObject({
        url: "https://example.com/image.png",
        alt: "Alt text",
        title: "Title",
      });
    });

    it("skips images inside code blocks", () => {
      const images = extractMarkdownImages(
        "```md\n![Code](https://example.com/code.png)\n```\n\n![Real](https://example.com/real.png)",
      );

      expect(images).toHaveLength(1);
      expect(images[0]?.url).toBe("https://example.com/real.png");
    });
  });

  describe("getCoverImageId", () => {
    it("gets cover image ID from frontmatter", () => {
      const entity = {
        content: `---
title: Test Post
coverImageId: hero-image-123
---

Content here`,
      };

      const result = getCoverImageId(entity);
      expect(result).toBe("hero-image-123");
    });

    it("returns null when no cover image", () => {
      const entity = {
        content: `---
title: Test Post
---

Content here`,
      };

      const result = getCoverImageId(entity);
      expect(result).toBeNull();
    });

    it("returns null for empty content", () => {
      const entity = { content: "" };

      const result = getCoverImageId(entity);
      expect(result).toBeNull();
    });
  });

  describe("setCoverImageId", () => {
    it("sets cover image ID on entity", () => {
      const entity = {
        id: "test-123",
        content: `---
title: Test Post
---

Content here`,
      };

      const result = setCoverImageId(entity, "new-cover-image");

      expect(result.id).toBe("test-123");
      expect(getCoverImageId(result)).toBe("new-cover-image");
    });

    it("removes cover image when null", () => {
      const entity = {
        id: "test-123",
        content: `---
title: Test Post
coverImageId: old-image
---

Content here`,
      };

      const result = setCoverImageId(entity, null);

      expect(getCoverImageId(result)).toBeNull();
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
});
