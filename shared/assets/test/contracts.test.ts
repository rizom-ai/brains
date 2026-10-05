import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  ASSET_CHUNK_BYTES,
  assetRecordSchema,
  base64AssetSource,
  chunkAssetSource,
  createAssetRef,
  getAssetDigest,
  parseAssetRef,
  resolveAssetStageLimits,
} from "../src";

const digest = "a".repeat(64);

async function collect(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): Promise<number[][]> {
  const collected: number[][] = [];
  for await (const chunk of chunks) collected.push(Array.from(chunk));
  return collected;
}

async function* pieces(
  ...parts: number[][]
): AsyncGenerator<Uint8Array, void, undefined> {
  yield* parts.map((part) => Uint8Array.from(part));
}

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

describe("asset chunking", () => {
  test("stores assets as 1 MiB chunks", () => {
    expect(ASSET_CHUNK_BYTES).toBe(1024 * 1024);
  });

  test("splits one buffer into exact chunks with a shorter tail", async () => {
    const source = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    expect(await collect(chunkAssetSource(source, 4))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10],
    ]);
  });

  test("re-chunks irregular stream pieces to the same boundaries", async () => {
    const stream = pieces([1, 2, 3], [], [4, 5, 6, 7, 8], [9], [10]);

    expect(await collect(chunkAssetSource(stream, 4))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10],
    ]);
  });

  test("yields nothing for an empty source", async () => {
    expect(await collect(chunkAssetSource(new Uint8Array(0), 4))).toEqual([]);
    expect(await collect(chunkAssetSource(pieces(), 4))).toEqual([]);
  });

  test("rejects a non-positive chunk size", async () => {
    expect(collect(chunkAssetSource(new Uint8Array(1), 0))).rejects.toThrow(
      "chunkBytes must be a positive safe integer",
    );
  });
});

describe("base64 asset sources", () => {
  test("decodes in slices that match a whole-buffer decode", async () => {
    const source = randomBytes(1001);
    const encoded = source.toString("base64");

    const decoded = (await collect(base64AssetSource(encoded, 8))).flat();

    expect(Buffer.from(decoded)).toEqual(source);
  });

  test("slices feed exact chunk boundaries", async () => {
    const source = randomBytes(25);
    const chunks = await collect(
      chunkAssetSource(base64AssetSource(source.toString("base64"), 12), 10),
    );

    expect(chunks.map((chunk) => chunk.length)).toEqual([10, 10, 5]);
    expect(Buffer.from(chunks.flat())).toEqual(source);
  });

  test("rejects malformed base64 instead of silently dropping characters", async () => {
    expect(collect(base64AssetSource("AAAA!AAA", 4))).rejects.toThrow(
      "Invalid base64 asset payload",
    );
    expect(collect(base64AssetSource("AAA", 4))).rejects.toThrow(
      "Invalid base64 asset payload",
    );
    expect(collect(base64AssetSource("AA==AAAA", 4))).rejects.toThrow(
      "Invalid base64 asset payload",
    );
  });

  test("requires slices that are a positive multiple of four characters", () => {
    expect(() => base64AssetSource("AAAA", 6)).toThrow(
      "sliceChars must be a positive multiple of 4",
    );
  });
});

describe("asset staging limits", () => {
  test("options may lower but never raise the repository ceiling", () => {
    expect(resolveAssetStageLimits({}, 10)).toEqual({ maxBytes: 10 });
    expect(resolveAssetStageLimits({ maxBytes: 4 }, 10)).toEqual({
      maxBytes: 4,
    });
    expect(resolveAssetStageLimits({ maxBytes: 40 }, 10)).toEqual({
      maxBytes: 10,
    });
  });

  test("rejects an expected size above the limit before any bytes are read", () => {
    expect(() =>
      resolveAssetStageLimits({ expectedSize: 11, maxBytes: 10 }, 100),
    ).toThrow("Asset exceeds 10-byte limit: expected 11 bytes");
    expect(resolveAssetStageLimits({ expectedSize: 0 }, 10)).toEqual({
      maxBytes: 10,
      expectedSize: 0,
    });
  });

  test("rejects invalid limit values", () => {
    expect(() => resolveAssetStageLimits({ maxBytes: 0 }, 10)).toThrow(
      "maxBytes must be a positive safe integer",
    );
    expect(() => resolveAssetStageLimits({ expectedSize: -1 }, 10)).toThrow(
      "expectedSize must be a non-negative safe integer",
    );
  });
});
