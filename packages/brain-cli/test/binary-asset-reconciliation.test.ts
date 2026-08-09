import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssetRef } from "@brains/assets";
import { computeContentHash } from "@brains/utils/hash";
import { reconcileImageAssets } from "../src/lib/binary-asset-reconciliation";
import type { BinaryEntityRow } from "../src/lib/binary-asset-migration";
import {
  ObservedAssetStore,
  ObservedRepository,
} from "./helpers/binary-asset-observations";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, "base64");
const TINY_PNG_REF = createAssetRef(
  createHash("sha256").update(TINY_PNG_BYTES).digest("hex"),
);
const temporaryDirectories: string[] = [];

function referencedRow(
  overrides: Partial<BinaryEntityRow> = {},
): BinaryEntityRow {
  return {
    id: "hero",
    entityType: "image",
    content: TINY_PNG_REF,
    contentHash: computeContentHash(TINY_PNG_REF),
    visibility: "public",
    metadata: {
      format: "png",
      mediaType: "image/png",
      sizeBytes: TINY_PNG_BYTES.byteLength,
      width: 1,
      height: 1,
    },
    created: 100,
    updated: 200,
    ...overrides,
  };
}

function sourceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "binary-reconcile-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("image asset reconciliation", () => {
  test("restores a missing asset from its canonical brain-data image path", async () => {
    const source = sourceDirectory();
    mkdirSync(join(source, "image"), { recursive: true });
    writeFileSync(join(source, "image", "hero.png"), TINY_PNG_BYTES);
    const repository = new ObservedRepository([referencedRow()]);
    const assets = new ObservedAssetStore(repository.events);

    const result = await reconcileImageAssets({
      repository,
      assets,
      sourceDirectory: source,
    });

    expect(result).toEqual({
      rowCount: 1,
      presentCount: 0,
      restorableCount: 0,
      restoredCount: 1,
      failures: [],
    });
    expect(await assets.read(TINY_PNG_REF)).toEqual(TINY_PNG_BYTES);
    expect(repository.events).toContain("put-stream");
    expect(repository.updates).toEqual([]);
  });

  test("dry-run verifies restorable source bytes without writing assets", async () => {
    const source = sourceDirectory();
    mkdirSync(join(source, "image"), { recursive: true });
    writeFileSync(join(source, "image", "hero.png"), TINY_PNG_BYTES);
    const repository = new ObservedRepository([referencedRow()]);
    const assets = new ObservedAssetStore(repository.events);

    const result = await reconcileImageAssets({
      repository,
      assets,
      sourceDirectory: source,
      dryRun: true,
    });

    expect(result.restorableCount).toBe(1);
    expect(result.restoredCount).toBe(0);
    expect(result.failures).toEqual([]);
    expect(repository.events.some((event) => event.startsWith("put:"))).toBe(
      false,
    );
  });

  test("resolves nested and entity-prefixed IDs without escaping the source", async () => {
    const source = sourceDirectory();
    mkdirSync(join(source, "image", "landing"), { recursive: true });
    writeFileSync(join(source, "image", "landing", "hero.png"), TINY_PNG_BYTES);
    const repository = new ObservedRepository([
      referencedRow({ id: "image:landing:hero" }),
    ]);
    const assets = new ObservedAssetStore(repository.events);

    const result = await reconcileImageAssets({
      repository,
      assets,
      sourceDirectory: source,
    });

    expect(result.restoredCount).toBe(1);
    expect(result.failures).toEqual([]);
  });

  test("reports a missing source file even when the runtime asset is valid", async () => {
    const source = sourceDirectory();
    const repository = new ObservedRepository([referencedRow()]);
    const assets = new ObservedAssetStore(repository.events);
    await assets.put(TINY_PNG_BYTES);
    repository.events.length = 0;

    const result = await reconcileImageAssets({
      repository,
      assets,
      sourceDirectory: source,
    });

    expect(result.presentCount).toBe(1);
    expect(result.restoredCount).toBe(0);
    expect(result.failures).toEqual([{ id: "hero", reason: "source-missing" }]);
    expect(repository.events.some((event) => event.startsWith("put:"))).toBe(
      false,
    );
  });

  test("reports drifted source bytes even when the runtime asset is valid", async () => {
    const source = sourceDirectory();
    mkdirSync(join(source, "image"), { recursive: true });
    const driftedBytes = Buffer.from(TINY_PNG_BYTES);
    driftedBytes[driftedBytes.byteLength - 1] = 1;
    writeFileSync(join(source, "image", "hero.png"), driftedBytes);
    const repository = new ObservedRepository([referencedRow()]);
    const assets = new ObservedAssetStore(repository.events);
    await assets.put(TINY_PNG_BYTES);
    repository.events.length = 0;

    const result = await reconcileImageAssets({
      repository,
      assets,
      sourceDirectory: source,
    });

    expect(result.presentCount).toBe(1);
    expect(result.restoredCount).toBe(0);
    expect(result.failures).toEqual([
      { id: "hero", reason: "source-digest-mismatch" },
    ]);
  });

  test("refuses mismatched source bytes and unsafe entity IDs", async () => {
    const source = sourceDirectory();
    mkdirSync(join(source, "image"), { recursive: true });
    writeFileSync(join(source, "image", "hero.png"), Buffer.from("wrong"));
    const repository = new ObservedRepository([
      referencedRow(),
      referencedRow({ id: "..:outside" }),
    ]);
    const assets = new ObservedAssetStore(repository.events);

    const result = await reconcileImageAssets({
      repository,
      assets,
      sourceDirectory: source,
    });

    expect(result.restoredCount).toBe(0);
    expect(result.failures).toEqual([
      { id: "hero", reason: "source-size-mismatch" },
      { id: "..:outside", reason: "unsafe-entity-id" },
    ]);
    expect(repository.events.some((event) => event.startsWith("put:"))).toBe(
      false,
    );
  });
});
