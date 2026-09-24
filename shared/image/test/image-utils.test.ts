import { describe, expect, it } from "bun:test";
import { detectImageFormat, inspectImageBytes } from "../src/lib/image-utils";

// Byte-level helpers are for ingestion actors, not durable entity reads.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("producer image byte helpers", () => {
  it("detects supported raster signatures", () => {
    expect(detectImageFormat(PNG)).toBe("png");
    expect(detectImageFormat(new Uint8Array([255, 216, 255, 224]))).toBe(
      "jpeg",
    );
    expect(detectImageFormat(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("inspects measured image facts", () => {
    expect(inspectImageBytes(PNG, "image/png")).toEqual({
      format: "png",
      mediaType: "image/png",
      sizeBytes: PNG.byteLength,
      width: 1,
      height: 1,
    });
  });

  it("rejects mismatched MIME and unsupported signatures", () => {
    expect(() => inspectImageBytes(PNG, "image/jpeg")).toThrow();
    expect(() =>
      inspectImageBytes(new Uint8Array([1, 2, 3]), "image/png"),
    ).toThrow();
  });
});
