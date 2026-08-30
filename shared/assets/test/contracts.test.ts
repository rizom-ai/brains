import { describe, expect, test } from "bun:test";
import {
  assertPreparedAsset,
  assetRecordSchema,
  computeAssetDigest,
  createAssetRef,
  getAssetDigest,
  parseAssetRef,
  prepareAsset,
  type PreparedAsset,
} from "../src";

const digest = "a".repeat(64);

describe("asset references", () => {
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

  test("validates matching records", () => {
    const ref = createAssetRef(digest);
    expect(assetRecordSchema.parse({ ref, digest, sizeBytes: 42 })).toEqual({
      ref,
      digest,
      sizeBytes: 42,
    });
    expect(() =>
      assetRecordSchema.parse({ ref, digest: "b".repeat(64), sizeBytes: 42 }),
    ).toThrow("Asset reference and digest must match");
  });
});

describe("asset preparation", () => {
  test("owns a bounded copy and derives its canonical identity", () => {
    const source = Uint8Array.from([1, 2, 3, 4]);
    const prepared = prepareAsset(source, { expectedSize: 4, maxBytes: 4 });
    source[0] = 9;

    expect(prepared.bytes).toEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(prepared.digest).toBe(computeAssetDigest(prepared.bytes));
    expect(prepared.ref).toBe(createAssetRef(prepared.digest));
    expect(prepared.sizeBytes).toBe(4);
    expect(() => assertPreparedAsset(prepared)).not.toThrow();
  });

  test("rejects oversized and incorrectly sized input", () => {
    expect(() =>
      prepareAsset(Uint8Array.from([1, 2]), { maxBytes: 1 }),
    ).toThrow("Asset exceeds 1-byte limit");
    expect(() =>
      prepareAsset(Uint8Array.from([1, 2]), { expectedSize: 3 }),
    ).toThrow("Asset size mismatch");
  });

  test("rejects forged prepared assets before persistence", () => {
    const prepared = prepareAsset(Uint8Array.from([1, 2, 3]));
    const forged = {
      ...prepared,
      bytes: Uint8Array.from([3, 2, 1]),
    } satisfies PreparedAsset;

    expect(() => assertPreparedAsset(forged)).toThrow(
      "Prepared asset digest mismatch",
    );
  });
});
