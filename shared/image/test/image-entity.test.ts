import { describe, expect, it } from "bun:test";
import { createAssetRef } from "@brains/entity-service";
import {
  createAssetImageEntity,
  createImageEntity,
  createPendingImageEntity,
  imageMetadataFor,
} from "../src/lib/image-entity";
import { imageSchema } from "../src/schemas/image";

// Minimal 1x1 pixel PNG (base64)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

describe("imageMetadataFor", () => {
  it("should parse base64 data URL and extract metadata", () => {
    const result = imageMetadataFor(TINY_PNG_DATA_URL);
    expect(result.format).toBe("png");
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it("should not set title or alt from binary content", () => {
    const result = imageMetadataFor(TINY_PNG_DATA_URL);
    expect("title" in result).toBe(false);
    expect("alt" in result).toBe(false);
  });
});

describe("createImageEntity", () => {
  it("should create a valid image entity from data URL", () => {
    const result = createImageEntity({
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
    const result = createImageEntity({
      dataUrl: TINY_PNG_DATA_URL,
      title: "My Image",
    });

    expect(result.metadata.alt).toBe("My Image");
  });
});

describe("asset-backed and pending images", () => {
  const base = {
    id: "img",
    entityType: "image" as const,
    visibility: "public" as const,
    contentHash: "hash",
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };

  it("says nothing about an asset reference or an empty payload", () => {
    expect(imageMetadataFor(createAssetRef("d".repeat(64)))).toEqual({});
    expect(imageMetadataFor("")).toEqual({});
  });

  it("records the described bytes and stores the reference", () => {
    const asset = { ref: createAssetRef("d".repeat(64)), sizeBytes: 70 };
    const result = createAssetImageEntity({
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
        sizeBytes: 70,
        width: 1,
        height: 1,
        status: "draft",
        attachmentType: "uploaded",
      },
    });
    expect(imageSchema.safeParse({ ...base, ...result }).success).toBe(true);
  });

  it("creates a pending image with no payload and no invented dimensions", () => {
    const pending = createPendingImageEntity({
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
        imageSchema.safeParse({ ...base, content: "", metadata: { status } })
          .success,
      ).toBe(true);
    }
  });

  it("still requires format and dimensions of a completed image", () => {
    const ref = createAssetRef("a".repeat(64));
    for (const metadata of [{}, { status: "draft" as const }]) {
      expect(
        imageSchema.safeParse({ ...base, content: ref, metadata }).success,
      ).toBe(false);
    }
  });
});
