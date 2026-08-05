import { describe, expect, test } from "bun:test";
import {
  assetRecordSchema,
  binaryContentModeSchema,
  binaryContentResolutionRequestSchema,
  createAssetRef,
  getAssetDigest,
  parseAssetRef,
} from "../src";

const digest = "a".repeat(64);

describe("asset contracts", () => {
  test("parses canonical lowercase SHA-256 references", () => {
    const ref = createAssetRef(digest);
    expect(ref).toBe(`asset://sha256/${digest}`);
    expect(parseAssetRef(ref)).toBe(ref);
    expect(getAssetDigest(ref)).toBe(digest);
  });

  test("rejects malformed and non-canonical references", () => {
    const malformed = [
      "asset://sha256/../brain.db",
      `asset://sha256/${"A".repeat(64)}`,
      `asset://sha512/${digest}`,
      `asset://sha256/${"a".repeat(63)}`,
      `${`asset://sha256/${digest}`}/extra`,
    ];

    for (const value of malformed) {
      expect(() => parseAssetRef(value)).toThrow();
    }
  });

  test("validates transitional binary-content requests", () => {
    const ref = createAssetRef(digest);
    expect(binaryContentModeSchema.parse("reference")).toBe("reference");
    expect(
      binaryContentResolutionRequestSchema.parse({
        ref,
        mediaType: "image/png",
      }),
    ).toEqual({ ref, mediaType: "image/png" });
    expect(() =>
      binaryContentResolutionRequestSchema.parse({
        ref,
        mediaType: "invalid\nmedia-type",
      }),
    ).toThrow();
  });

  test("validates asset records", () => {
    const ref = createAssetRef(digest);
    expect(assetRecordSchema.parse({ ref, digest, sizeBytes: 42 })).toEqual({
      ref,
      digest,
      sizeBytes: 42,
    });
    expect(() =>
      assetRecordSchema.parse({ ref, digest, sizeBytes: -1 }),
    ).toThrow();
    expect(() =>
      assetRecordSchema.parse({
        ref,
        digest: "b".repeat(64),
        sizeBytes: 42,
      }),
    ).toThrow("Asset reference and digest must match");
  });
});
