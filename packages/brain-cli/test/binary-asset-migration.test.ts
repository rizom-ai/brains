import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { createAssetRef } from "@brains/assets";
import { computeContentHash } from "@brains/utils/hash";
import {
  analyzeImageMigration,
  migrateImageAssets,
  verifyImageAssets,
  type BinaryEntityRow,
} from "../src/lib/binary-asset-migration";
import {
  ObservedAssetStore,
  ObservedRepository,
} from "./helpers/binary-asset-observations";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;
const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, "base64");
const TINY_PNG_DIGEST = createHash("sha256")
  .update(TINY_PNG_BYTES)
  .digest("hex");
const TINY_PNG_REF = createAssetRef(TINY_PNG_DIGEST);

function legacyRow(overrides: Partial<BinaryEntityRow> = {}): BinaryEntityRow {
  return {
    id: "hero",
    entityType: "image",
    content: TINY_PNG_DATA_URL,
    contentHash: "legacy-hash",
    visibility: "restricted",
    metadata: {
      title: "Hero",
      sourceUrl: "https://example.com/hero.png",
    },
    created: 100,
    updated: 200,
    ...overrides,
  };
}

describe("image binary asset migration", () => {
  test("plans canonical references and binary metadata without changing provenance", () => {
    const row = legacyRow();
    const analysis = analyzeImageMigration([row]);

    expect(analysis.blockers).toEqual([]);
    expect(analysis.legacyCount).toBe(1);
    expect(analysis.referenceCount).toBe(0);
    expect(analysis.uniqueAssetBytes).toBe(TINY_PNG_BYTES.byteLength);
    expect(analysis.duplicateBytesSaved).toBe(0);
    expect(analysis.candidates).toHaveLength(1);
    expect(analysis.candidates[0]).not.toHaveProperty("bytes");
    expect(analysis.candidates[0]?.ref).toBe(TINY_PNG_REF);
    expect(analysis.candidates[0]?.contentHash).toBe(
      computeContentHash(TINY_PNG_REF),
    );
    expect(analysis.candidates[0]?.metadata).toEqual({
      title: "Hero",
      sourceUrl: "https://example.com/hero.png",
      format: "png",
      mediaType: "image/png",
      sizeBytes: TINY_PNG_BYTES.byteLength,
      width: 1,
      height: 1,
    });
    expect(row.visibility).toBe("restricted");
    expect(row.created).toBe(100);
    expect(row.updated).toBe(200);
  });

  test("reports malformed, SVG, and unsupported rows as blockers", () => {
    const analysis = analyzeImageMigration([
      legacyRow({ id: "malformed", content: "data:image/png;base64,nope" }),
      legacyRow({
        id: "svg",
        content:
          "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
      }),
      legacyRow({
        id: "unsupported",
        content: "data:image/bmp;base64,Qk0AAAAA",
      }),
    ]);

    expect(analysis.candidates).toEqual([]);
    expect(analysis.blockers.map((blocker) => blocker.id)).toEqual([
      "malformed",
      "svg",
      "unsupported",
    ]);
    expect(analysis.blockers.map((blocker) => blocker.reason)).toEqual([
      "invalid-or-corrupt",
      "unsupported-svg",
      "unsupported-format",
    ]);
  });

  test("accounts for duplicate payload savings", () => {
    const analysis = analyzeImageMigration([
      legacyRow({ id: "one" }),
      legacyRow({ id: "two" }),
    ]);

    expect(analysis.legacyBytes).toBe(TINY_PNG_BYTES.byteLength * 2);
    expect(analysis.uniqueAssetBytes).toBe(TINY_PNG_BYTES.byteLength);
    expect(analysis.duplicateBytesSaved).toBe(TINY_PNG_BYTES.byteLength);
  });

  test("fails closed before asset writes when any row is blocked", async () => {
    const repository = new ObservedRepository([
      legacyRow(),
      legacyRow({ id: "bad", content: "not-an-image" }),
    ]);
    const assets = new ObservedAssetStore(repository.events);

    expect(migrateImageAssets({ repository, assets })).rejects.toThrow(
      "1 blocking image row",
    );

    expect(repository.events).toEqual(["probe-lock", "list:image"]);
    expect(repository.updates).toEqual([]);
  });

  test("rejects insufficient asset filesystem space before prewrite", async () => {
    const repository = new ObservedRepository([legacyRow()]);
    const assets = new ObservedAssetStore(repository.events);

    expect(
      migrateImageAssets({
        repository,
        assets,
        availableAssetBytes: TINY_PNG_BYTES.byteLength - 1,
      }),
    ).rejects.toThrow("Insufficient free space");

    expect(repository.events).toEqual(["probe-lock", "list:image"]);
  });

  test("prewrites and verifies every asset before one repository transaction", async () => {
    const repository = new ObservedRepository([
      legacyRow({ id: "one" }),
      legacyRow({ id: "two" }),
    ]);
    const assets = new ObservedAssetStore(repository.events);

    const result = await migrateImageAssets({ repository, assets });

    expect(result.migratedCount).toBe(2);
    expect(repository.updates).toHaveLength(2);
    expect(repository.updates[0]).toEqual({
      id: "one",
      entityType: "image",
      expectedContentHash: "legacy-hash",
      content: TINY_PNG_REF,
      contentHash: computeContentHash(TINY_PNG_REF),
      metadata: {
        title: "Hero",
        sourceUrl: "https://example.com/hero.png",
        format: "png",
        mediaType: "image/png",
        sizeBytes: TINY_PNG_BYTES.byteLength,
        width: 1,
        height: 1,
      },
    });
    expect(repository.ftsDeletes).toEqual([
      { id: "one", entityType: "image" },
      { id: "two", entityType: "image" },
    ]);
    expect(repository.events.at(-1)).toBe("transaction");
    expect(
      repository.events.filter((event) => event === "transaction"),
    ).toHaveLength(1);
    expect(
      repository.events.filter((event) => event.startsWith("verify:")),
    ).toHaveLength(1);
  });

  test("resumes a journaled prewrite by verifying without rewriting the asset", async () => {
    const repository = new ObservedRepository([legacyRow()]);
    const assets = new ObservedAssetStore(repository.events);
    await assets.put(TINY_PNG_BYTES);
    repository.events.length = 0;

    await migrateImageAssets({
      repository,
      assets,
      canReuseVerifiedAsset: async (candidate) =>
        candidate.ref === TINY_PNG_REF,
    });

    expect(repository.events.some((event) => event.startsWith("put:"))).toBe(
      false,
    );
    expect(repository.events).toContain(`verify:${TINY_PNG_REF}`);
    expect(repository.events.at(-1)).toBe("transaction");
  });

  test("removes stale image FTS rows for incomplete entities without updating them", async () => {
    const repository = new ObservedRepository([
      legacyRow({
        id: "pending",
        content: "",
        metadata: { status: "pending" },
      }),
    ]);
    const assets = new ObservedAssetStore(repository.events);

    const result = await migrateImageAssets({ repository, assets });

    expect(result.migratedCount).toBe(0);
    expect(repository.updates).toEqual([]);
    expect(repository.ftsDeletes).toEqual([
      { id: "pending", entityType: "image" },
    ]);
  });

  test("dry-run probes and analyzes without writing assets or entities", async () => {
    const repository = new ObservedRepository([legacyRow()]);
    const assets = new ObservedAssetStore(repository.events);

    const result = await migrateImageAssets({
      repository,
      assets,
      dryRun: true,
    });

    expect(result.migratedCount).toBe(0);
    expect(result.analysis.legacyCount).toBe(1);
    expect(repository.events).toEqual(["probe-lock", "list:image"]);
  });

  test("verification proves canonical references, assets, metadata, and FTS cleanup", async () => {
    const row = legacyRow({
      content: TINY_PNG_REF,
      contentHash: computeContentHash(TINY_PNG_REF),
      metadata: {
        format: "png",
        mediaType: "image/png",
        sizeBytes: TINY_PNG_BYTES.byteLength,
        width: 1,
        height: 1,
      },
    });
    const repository = new ObservedRepository([row]);
    const assets = new ObservedAssetStore(repository.events);
    await assets.put(TINY_PNG_BYTES);
    repository.events.length = 0;

    const result = await verifyImageAssets({ repository, assets });

    expect(result.verifiedCount).toBe(1);
    expect(result.failures).toEqual([]);
    expect(repository.events).toEqual([
      "probe-lock",
      "list:image",
      "fts:image",
      `verify:${TINY_PNG_REF}`,
    ]);
    expect(repository.updates).toEqual([]);
  });

  test("verification fails on legacy content and stale FTS rows", async () => {
    const repository = new ObservedRepository([legacyRow()]);
    repository.ftsEntities = [{ id: "hero", entityType: "image" }];
    const assets = new ObservedAssetStore(repository.events);

    const result = await verifyImageAssets({ repository, assets });

    expect(result.verifiedCount).toBe(0);
    expect(result.failures).toEqual([
      { id: "hero", reason: "legacy-content" },
      { id: "hero", reason: "stale-fts-row" },
    ]);
    expect(repository.events).toEqual([
      "probe-lock",
      "list:image",
      "fts:image",
    ]);
  });

  test("verifies existing references on idempotent reruns", async () => {
    const repository = new ObservedRepository([
      legacyRow({
        content: TINY_PNG_REF,
        contentHash: computeContentHash(TINY_PNG_REF),
        metadata: {
          format: "png",
          mediaType: "image/png",
          sizeBytes: TINY_PNG_BYTES.byteLength,
          width: 1,
          height: 1,
        },
      }),
    ]);
    const assets = new ObservedAssetStore(repository.events);
    await assets.put(TINY_PNG_BYTES);
    repository.events.length = 0;

    const result = await migrateImageAssets({ repository, assets });

    expect(result.migratedCount).toBe(0);
    expect(result.verifiedCount).toBe(1);
    expect(repository.updates).toEqual([]);
    expect(repository.ftsDeletes).toEqual([
      { id: "hero", entityType: "image" },
    ]);
    expect(repository.events.at(-1)).toBe("transaction");
  });
});
