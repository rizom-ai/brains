import { describe, expect, it } from "bun:test";
import { imageAdapter } from "../src/adapters/image-adapter";
import type { Image } from "../src/schemas/image";

// Minimal 1x1 pixel PNG (base64)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

const mockImageEntity: Image = {
  id: "img-123",
  entityType: "image",
  content: TINY_PNG_DATA_URL,
  metadata: {
    title: "Test Image",
    alt: "A test image",
    format: "png",
    width: 1,
    height: 1,
  },
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  contentHash: "abc123",
};

describe("ImageAdapter", () => {
  describe("entityType", () => {
    it("should have entityType 'image'", () => {
      expect(imageAdapter.entityType).toBe("image");
    });
  });

  describe("schema", () => {
    it("should have a valid schema", () => {
      expect(imageAdapter.schema).toBeDefined();
    });

    it("should validate a valid image entity", () => {
      const result = imageAdapter.schema.safeParse(mockImageEntity);
      expect(result.success).toBe(true);
    });
  });

  describe("toMarkdown", () => {
    it("should return content as-is (base64 data URL)", () => {
      const result = imageAdapter.toMarkdown(mockImageEntity);
      expect(result).toBe(TINY_PNG_DATA_URL);
    });
  });

  describe("fromMarkdown", () => {
    it("should parse base64 data URL and extract metadata", () => {
      const result = imageAdapter.fromMarkdown(TINY_PNG_DATA_URL);
      expect(result.entityType).toBe("image");
      expect(result.content).toBe(TINY_PNG_DATA_URL);
      expect(result.metadata?.format).toBe("png");
      expect(result.metadata?.width).toBe(1);
      expect(result.metadata?.height).toBe(1);
    });

    it("should generate title from format if not provided", () => {
      const result = imageAdapter.fromMarkdown(TINY_PNG_DATA_URL);
      // Title should be auto-generated
      expect(result.metadata?.title).toMatch(/image/i);
    });

    it("should default alt to title", () => {
      const result = imageAdapter.fromMarkdown(TINY_PNG_DATA_URL);
      expect(result.metadata?.alt).toBe(result.metadata?.title);
    });
  });

  describe("extractMetadata", () => {
    it("should return entity metadata", () => {
      const result = imageAdapter.extractMetadata(mockImageEntity);
      expect(result.title).toBe("Test Image");
      expect(result.alt).toBe("A test image");
      expect(result.format).toBe("png");
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    });
  });

  describe("createImageEntity", () => {
    it("should create a valid image entity from data URL", () => {
      const result = imageAdapter.createImageEntity({
        dataUrl: TINY_PNG_DATA_URL,
        title: "My Image",
        alt: "Description of my image",
      });

      expect(result.entityType).toBe("image");
      expect(result.content).toBe(TINY_PNG_DATA_URL);
      expect(result.metadata.title).toBe("My Image");
      expect(result.metadata.alt).toBe("Description of my image");
      expect(result.metadata.format).toBe("png");
      expect(result.metadata.width).toBe(1);
      expect(result.metadata.height).toBe(1);
    });

    it("should default alt to title if not provided", () => {
      const result = imageAdapter.createImageEntity({
        dataUrl: TINY_PNG_DATA_URL,
        title: "My Image",
      });

      expect(result.metadata.alt).toBe("My Image");
    });
  });
});
