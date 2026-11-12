import { describe, expect, it } from "bun:test";
import { createImageEntity, imageMetadataFor } from "../src/lib/image-entity";

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
