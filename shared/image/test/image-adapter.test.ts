import { describe, expect, it } from "bun:test";
import { createAssetRef } from "@brains/entity-service";
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
  visibility: "public",
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

    it("accepts an asset reference without parsing bytes", () => {
      const ref = createAssetRef("c".repeat(64));
      expect(imageAdapter.fromMarkdown(ref)).toEqual({
        entityType: "image",
        content: ref,
      });
    });

    it("should not set title or alt from binary content", () => {
      const result = imageAdapter.fromMarkdown(TINY_PNG_DATA_URL);
      expect(result.metadata?.title).toBeUndefined();
      expect(result.metadata?.alt).toBeUndefined();
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

  describe("createAssetImageEntity", () => {
    const bytes = Buffer.from(TINY_PNG_BASE64, "base64");
    const asset = {
      ref: createAssetRef("d".repeat(64)),
      sizeBytes: bytes.byteLength,
    };

    it("records the described bytes and stores the reference", () => {
      const result = imageAdapter.createAssetImageEntity({
        asset,
        description: {
          format: "png",
          mediaType: "image/png",
          width: 1,
          height: 1,
        },
        title: "Uploaded",
        status: "draft",
        attachmentType: "uploaded",
      });

      expect(result).toEqual({
        entityType: "image",
        content: asset.ref,
        metadata: {
          title: "Uploaded",
          alt: "Uploaded",
          format: "png",
          mediaType: "image/png",
          sizeBytes: bytes.byteLength,
          width: 1,
          height: 1,
          status: "draft",
          attachmentType: "uploaded",
        },
      });
      expect(
        imageAdapter.schema.safeParse({
          ...mockImageEntity,
          ...result,
        }).success,
      ).toBe(true);
    });
  });

  describe("pending and failed images", () => {
    const base = {
      id: "img-pending",
      entityType: "image" as const,
      visibility: "public" as const,
      contentHash: "hash",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
    };

    it("creates a pending image with no payload and no invented dimensions", () => {
      const pending = imageAdapter.createPendingImageEntity({
        title: "Cover",
        alt: "Cover",
        status: "pending",
        attachmentType: "uploaded",
      });

      expect(pending.content).toBe("");
      expect(pending.metadata).toEqual({
        title: "Cover",
        alt: "Cover",
        status: "pending",
        attachmentType: "uploaded",
      });
    });

    it("accepts pending and failed images without format or dimensions", () => {
      for (const status of ["pending", "failed"] as const) {
        expect(
          imageAdapter.schema.safeParse({
            ...base,
            content: "",
            metadata: { status },
          }).success,
        ).toBe(true);
      }
    });

    it("still requires format and dimensions of a completed image", () => {
      const ref = createAssetRef("a".repeat(64));
      for (const metadata of [{}, { status: "draft" as const }]) {
        expect(
          imageAdapter.schema.safeParse({ ...base, content: ref, metadata })
            .success,
        ).toBe(false);
      }
    });

    it("reads an image with no payload back without parsing bytes", () => {
      expect(imageAdapter.fromMarkdown("")).toEqual({
        entityType: "image",
        content: "",
      });
    });
  });
});
