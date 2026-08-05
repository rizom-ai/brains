import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssetRef, type AssetRef } from "@brains/assets";
import {
  AssetBinaryContentResolver,
  AssetStoreError,
  FilesystemAssetStore,
} from "../src";

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function chunks(...values: Uint8Array[]): AsyncIterable<Uint8Array> {
  return (async function* (): AsyncGenerator<Uint8Array> {
    yield* values;
  })();
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected promise to reject");
}

describe("FilesystemAssetStore", () => {
  let root: string;
  let store: FilesystemAssetStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "brains-assets-"));
    store = FilesystemAssetStore.createFresh({ assetDirectory: root });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("writes, reads, stats, and verifies immutable bytes", async () => {
    const bytes = Buffer.from("durable asset");
    const record = await store.put(bytes);

    expect(record).toEqual({
      ref: createAssetRef(digest(bytes)),
      digest: digest(bytes),
      sizeBytes: bytes.byteLength,
    });
    expect(Buffer.from(await store.read(record.ref))).toEqual(bytes);
    expect(await store.stat(record.ref)).toEqual({
      ref: record.ref,
      sizeBytes: bytes.byteLength,
    });
    expect(await store.verify(record.ref)).toEqual({
      ref: record.ref,
      sizeBytes: bytes.byteLength,
      expectedDigest: record.digest,
      actualDigest: record.digest,
      valid: true,
    });
  });

  test("materializes the bounded legacy data-URL bridge", async () => {
    const bytes = Buffer.from("legacy bridge bytes");
    const record = await store.put(bytes);
    const resolver = new AssetBinaryContentResolver(store);

    expect(
      await resolver.materializeLegacyDataUrl({
        ref: record.ref,
        mediaType: "image/png",
      }),
    ).toBe(`data:image/png;base64,${bytes.toString("base64")}`);
  });

  test("deduplicates concurrent writes of identical content", async () => {
    const bytes = Buffer.from("same content");
    const records = await Promise.all(
      Array.from({ length: 24 }, () => store.put(bytes)),
    );

    expect(new Set(records.map((record) => record.ref)).size).toBe(1);
    // The digest directory holds digests and nothing else, so a scanner can
    // treat every entry as an asset without special-casing scratch files.
    expect(await readdir(join(root, "sha256"))).toEqual([
      records[0]?.digest ?? "",
    ]);
    expect(await readdir(join(root, ".tmp"))).toEqual([]);
  });

  test("streams without buffering and enforces byte policies", async () => {
    const record = await store.putStream(
      chunks(Buffer.from("one"), Buffer.from("two")),
      { expectedSize: 6, maxBytes: 6 },
    );
    expect(Buffer.from(await store.read(record.ref)).toString()).toBe("onetwo");

    expect(
      await rejectionOf(
        store.putStream(chunks(Buffer.from("123"), Buffer.from("456")), {
          maxBytes: 5,
        }),
      ),
    ).toMatchObject({ code: "too-large" });
    expect(
      await rejectionOf(
        store.putStream(chunks(Buffer.from("123")), { expectedSize: 4 }),
      ),
    ).toMatchObject({ code: "size-mismatch" });
    expect(await readdir(join(root, ".tmp"))).toEqual([]);
  });

  test("removes temporary files when a stream fails", async () => {
    const failing = async function* (): AsyncGenerator<Uint8Array> {
      yield Buffer.from("partial");
      throw new Error("source failed");
    };

    expect(await rejectionOf(store.putStream(failing()))).toHaveProperty(
      "message",
      "source failed",
    );
    expect(await readdir(join(root, ".tmp"))).toEqual([]);
  });

  test("detects corrupt existing content and never overwrites it", async () => {
    const bytes = Buffer.from("expected content");
    const record = await store.put(bytes);
    const target = join(root, "sha256", record.digest);
    await writeFile(target, "corrupt");

    expect(await store.verify(record.ref)).toMatchObject({ valid: false });
    const writeError = await rejectionOf(store.put(bytes));
    expect(writeError).toBeInstanceOf(AssetStoreError);
    expect(writeError).toMatchObject({ code: "conflict" });
    expect(Buffer.from(await store.read(record.ref)).toString()).toBe(
      "corrupt",
    );
  });

  test("rejects malformed refs and non-regular digest paths", async () => {
    expect(
      await rejectionOf(store.read("asset://sha256/../brain.db" as AssetRef)),
    ).toBeInstanceOf(Error);

    const bytes = Buffer.from("directory collision");
    const ref = createAssetRef(digest(bytes));
    await mkdir(join(root, "sha256", digest(bytes)), { recursive: true });
    expect(await rejectionOf(store.stat(ref))).toMatchObject({
      code: "not-a-file",
    });
  });

  test("reports missing refs without creating storage directories", async () => {
    const ref = createAssetRef("0".repeat(64));
    expect(await store.stat(ref)).toBeNull();
    expect(await rejectionOf(store.read(ref))).toMatchObject({
      code: "not-found",
    });
    expect(await rejectionOf(store.verify(ref))).toMatchObject({
      code: "not-found",
    });
  });

  test("validates stream options before creating temporary files", async () => {
    expect(
      await rejectionOf(
        store.putStream(chunks(Buffer.from("x")), { expectedSize: -1 }),
      ),
    ).toMatchObject({ code: "invalid-options" });
    expect(
      await rejectionOf(
        store.putStream(chunks(Buffer.from("x")), {
          expectedSize: 2,
          maxBytes: 1,
        }),
      ),
    ).toMatchObject({ code: "too-large" });
  });
});
