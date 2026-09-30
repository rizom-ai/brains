import { createTestEntity } from "../src/test/index";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import {
  ASSET_CHUNK_BYTES,
  base64AssetSource,
  computeAssetDigest,
  createAssetRef,
  type StagedAsset,
} from "@brains/assets";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createSilentLogger } from "@brains/test-utils";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { mockEmbeddingService } from "./helpers/mock-services";
import { EntityService, type BaseEntity } from "../src";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";

type AssetTable = "asset_uploads" | "asset_chunks" | "assets" | "entities";

describe("SQLite durable assets", () => {
  let ctx: EntityServiceTestContext;
  let client: Client;

  beforeEach(async () => {
    ctx = await setupEntityService([
      {
        name: "test",
        schema: minimalTestSchema,
        adapter: minimalTestAdapter,
        config: {
          embeddable: false,
          fullTextSearchable: false,
          binaryStorage: "asset",
        },
      },
    ]);
    await ctx.entityService.initialize();
    client = createClient({ url: ctx.dbConfig.url });
  });

  afterEach(async () => {
    client.close();
    await ctx.cleanup();
  });

  function entityForAsset(id: string, asset: StagedAsset): BaseEntity {
    return createTestEntity("test", {
      id,
      content: asset.ref,
      metadata: { sizeBytes: asset.sizeBytes },
    });
  }

  async function tableCount(table: AssetTable): Promise<number> {
    const result = await client.execute(
      `SELECT count(*) AS count FROM ${table}`,
    );
    return Number(result.rows[0]?.["count"] ?? 0);
  }

  async function concat(chunks: AsyncIterable<Uint8Array>): Promise<Buffer> {
    const collected: Uint8Array[] = [];
    for await (const chunk of chunks) collected.push(chunk);
    return Buffer.concat(collected);
  }

  test("stages chunks and publishes them with the entity reference", async () => {
    const source = randomBytes(ASSET_CHUNK_BYTES * 2 + ASSET_CHUNK_BYTES / 2);
    const asset = await ctx.entityService.stageAsset(source);

    expect(asset.ref).toBe(createAssetRef(computeAssetDigest(source)));
    expect(asset.sizeBytes).toBe(source.byteLength);
    expect(await ctx.entityService.statAsset(asset.ref)).toBeNull();
    expect(await tableCount("asset_chunks")).toBe(3);
    expect(await tableCount("assets")).toBe(0);

    await ctx.entityService.createEntity({
      entity: entityForAsset("atomic-create", asset),
      stagedAsset: asset,
    });

    expect(await ctx.entityService.statAsset(asset.ref)).toEqual({
      ref: asset.ref,
      sizeBytes: source.byteLength,
    });
    expect(Buffer.from(await ctx.entityService.readAsset(asset.ref))).toEqual(
      source,
    );
    const streamed: number[] = [];
    for await (const chunk of await ctx.entityService.openAsset(asset.ref)) {
      streamed.push(chunk.byteLength);
    }
    expect(streamed).toEqual([
      ASSET_CHUNK_BYTES,
      ASSET_CHUNK_BYTES,
      ASSET_CHUNK_BYTES / 2,
    ]);
    expect(await ctx.entityService.verifyAsset(asset.ref)).toEqual(
      expect.objectContaining({
        ref: asset.ref,
        expectedDigest: asset.digest,
        actualDigest: asset.digest,
        valid: true,
      }),
    );

    const listed = await ctx.entityService.listEntities({
      entityType: "test",
      options: { binaryContent: "reference" },
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.content).toBe(asset.ref);

    const fts = await client.execute(
      "SELECT count(*) AS count FROM entity_fts WHERE entity_type = 'test'",
    );
    expect(Number(fts.rows[0]?.["count"] ?? 0)).toBe(0);
  });

  test("stages streamed and base64 sources to the same identity", async () => {
    const source = randomBytes(ASSET_CHUNK_BYTES + 17);
    async function* irregular(): AsyncGenerator<Uint8Array> {
      yield source.subarray(0, 700_000);
      yield source.subarray(700_000, 700_001);
      yield source.subarray(700_001);
    }

    const streamed = await ctx.entityService.stageAsset(irregular());
    const decoded = await ctx.entityService.stageAsset(
      base64AssetSource(source.toString("base64")),
    );

    expect(streamed.ref).toBe(createAssetRef(computeAssetDigest(source)));
    expect(decoded.ref).toBe(streamed.ref);
  });

  test("interleaves staging with other event-loop work", async () => {
    const source = randomBytes(ASSET_CHUNK_BYTES * 4);
    let ticks = 0;
    let staging = true;
    const heartbeat = async (): Promise<void> => {
      if (!staging) return;
      ticks++;
      await new Promise((resolve) => setImmediate(resolve));
      return heartbeat();
    };

    const beating = heartbeat();
    await ctx.entityService.stageAsset(source);
    staging = false;
    await beating;

    expect(ticks).toBeGreaterThanOrEqual(4);
  });

  test("deduplicates concurrent stagings of identical bytes", async () => {
    const source = Buffer.from("shared immutable bytes");
    const [first, second] = await Promise.all([
      ctx.entityService.stageAsset(source),
      ctx.entityService.stageAsset(source),
    ]);

    await Promise.all([
      ctx.entityService.createEntity({
        entity: entityForAsset("dedupe-a", first),
        stagedAsset: first,
      }),
      ctx.entityService.createEntity({
        entity: entityForAsset("dedupe-b", second),
        stagedAsset: second,
      }),
    ]);

    expect(await tableCount("assets")).toBe(1);
    expect(await tableCount("entities")).toBe(2);
    // The losing upload is discarded once its mutation settles.
    expect(await tableCount("asset_uploads")).toBe(1);
    expect(await tableCount("asset_chunks")).toBe(1);
  });

  test("a staged handle publishes at most once and cannot be forged", async () => {
    const asset = await ctx.entityService.stageAsset(Buffer.from("once"));
    await ctx.entityService.createEntity({
      entity: entityForAsset("first-use", asset),
      stagedAsset: asset,
    });

    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("second-use", asset),
        stagedAsset: asset,
      }),
    ).rejects.toThrow("Staged asset was already used");

    const forged: StagedAsset = { ...asset };
    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("forged", forged),
        stagedAsset: forged,
      }),
    ).rejects.toThrow("Unknown staged asset");
    expect(await tableCount("entities")).toBe(1);
  });

  test("keeps projection writes behind asset existence and FTS policy", async () => {
    const asset = await ctx.entityService.stageAsset(
      Buffer.from("projection source bytes"),
    );
    await ctx.entityService.createEntity({
      entity: entityForAsset("asset-seed", asset),
      stagedAsset: asset,
    });

    const store = ctx.entityService.getProjectionStore();
    await store.claimPendingWave({
      waveId: "asset-wave",
      graphFingerprint: "asset-graph",
      startedAt: 10,
    });
    await store.putWaveRules("asset-wave", [
      { ruleId: "asset-rule", targetType: "test", level: 0 },
    ]);
    await store.queueWaveRule("asset-wave", "asset-rule", "asset-job");
    const outcome = await store.applyRuleResult({
      waveId: "asset-wave",
      ruleId: "asset-rule",
      ruleVersion: "1",
      inputFingerprint: "asset-input",
      writeIntents: [
        {
          operation: "upsert",
          entity: {
            id: "projected-asset",
            entityType: "test",
            content: asset.ref,
            metadata: { sizeBytes: asset.sizeBytes },
            visibility: "public",
          },
        },
      ],
      completedAt: 20,
    });

    expect(outcome?.changedTargets).toEqual([
      expect.objectContaining({ entityId: "projected-asset" }),
    ]);
    expect(await tableCount("assets")).toBe(1);
    expect(await tableCount("entities")).toBe(2);
    const fts = await client.execute(
      "SELECT count(*) AS count FROM entity_fts WHERE entity_type = 'test'",
    );
    expect(Number(fts.rows[0]?.["count"] ?? 0)).toBe(0);
  });

  test("discards the staged upload when entity persistence fails", async () => {
    const existing = await ctx.entityService.stageAsset(
      Buffer.from("already committed"),
    );
    await ctx.entityService.createEntity({
      entity: entityForAsset("duplicate-id", existing),
      stagedAsset: existing,
    });

    const rejected = await ctx.entityService.stageAsset(
      Buffer.from("must roll back"),
    );
    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("duplicate-id", rejected),
        stagedAsset: rejected,
      }),
    ).rejects.toThrow();

    expect(await ctx.entityService.statAsset(existing.ref)).not.toBeNull();
    expect(await ctx.entityService.statAsset(rejected.ref)).toBeNull();
    expect(await tableCount("assets")).toBe(1);
    expect(await tableCount("asset_uploads")).toBe(1);
    expect(await tableCount("asset_chunks")).toBe(1);
  });

  test("refuses to publish an absent or mismatched asset reference", async () => {
    const asset = await ctx.entityService.stageAsset(
      Buffer.from("canonical bytes"),
    );
    const missing = await ctx.entityService.stageAsset(
      Buffer.from("not committed"),
    );

    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("absent", missing),
      }),
    ).rejects.toThrow(`Asset not found: ${missing.ref}`);

    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("mismatch", missing),
        stagedAsset: asset,
      }),
    ).rejects.toThrow("does not match canonical test content");

    expect(await tableCount("assets")).toBe(0);
    expect(await tableCount("entities")).toBe(0);
  });

  test("fails closed when staged chunks are incomplete at publish", async () => {
    const asset = await ctx.entityService.stageAsset(
      randomBytes(ASSET_CHUNK_BYTES + 1),
    );
    await client.execute("DELETE FROM asset_chunks WHERE ordinal = 1");

    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("incomplete", asset),
        stagedAsset: asset,
      }),
    ).rejects.toThrow("Asset integrity check failed");

    expect(await tableCount("assets")).toBe(0);
    expect(await tableCount("entities")).toBe(0);
  });

  test("fails closed when an existing digest records a different size", async () => {
    const source = Buffer.from("expected payload");
    const digest = computeAssetDigest(source);
    const wrong = Buffer.from("expected payload plus");
    await client.batch([
      {
        sql: "INSERT INTO asset_uploads (upload_id, created) VALUES ('forged', ?)",
        args: [Date.now()],
      },
      {
        sql: "INSERT INTO asset_chunks (upload_id, ordinal, bytes) VALUES ('forged', 0, ?)",
        args: [wrong],
      },
      {
        sql: "INSERT INTO assets (digest, upload_id, size_bytes, chunk_count, created) VALUES (?, 'forged', ?, 1, ?)",
        args: [digest, wrong.byteLength, Date.now()],
      },
    ]);
    const asset = await ctx.entityService.stageAsset(source);

    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("corrupt-duplicate", asset),
        stagedAsset: asset,
      }),
    ).rejects.toThrow("Asset integrity check failed");
    expect(await tableCount("entities")).toBe(0);
  });

  test("verification detects corrupted chunk bytes", async () => {
    const asset = await ctx.entityService.stageAsset(
      Buffer.from("expected payload"),
    );
    await ctx.entityService.createEntity({
      entity: entityForAsset("corrupted", asset),
      stagedAsset: asset,
    });
    await client.execute({
      sql: "UPDATE asset_chunks SET bytes = ?",
      args: [Buffer.from("corrupt payload!")],
    });

    const verification = await ctx.entityService.verifyAsset(asset.ref);
    expect(verification.valid).toBe(false);
    expect(verification.actualDigest).not.toBe(asset.digest);
  });

  test("reads fail visibly when a published chunk is missing", async () => {
    const asset = await ctx.entityService.stageAsset(
      randomBytes(ASSET_CHUNK_BYTES * 2),
    );
    await ctx.entityService.createEntity({
      entity: entityForAsset("missing-chunk", asset),
      stagedAsset: asset,
    });
    await client.execute("DELETE FROM asset_chunks WHERE ordinal = 1");

    expect(ctx.entityService.readAsset(asset.ref)).rejects.toThrow(
      "Asset integrity check failed",
    );
    expect(
      concat(await ctx.entityService.openAsset(asset.ref)),
    ).rejects.toThrow("Asset integrity check failed");
  });

  test("enforces byte limits while staging and leaves nothing behind", async () => {
    expect(
      ctx.entityService.stageAsset(Buffer.from("abc"), { maxBytes: 2 }),
    ).rejects.toThrow("Asset exceeds 2-byte limit");
    expect(
      ctx.entityService.stageAsset(Buffer.from("abc"), { expectedSize: 4 }),
    ).rejects.toThrow("Asset size mismatch: expected 4 bytes, received 3");

    expect(await tableCount("asset_uploads")).toBe(0);
    expect(await tableCount("asset_chunks")).toBe(0);
  });

  test("sweeps expired orphan uploads at startup", async () => {
    await client.batch([
      "INSERT INTO asset_uploads (upload_id, created) VALUES ('crashed', 0)",
      {
        sql: "INSERT INTO asset_chunks (upload_id, ordinal, bytes) VALUES ('crashed', 0, ?)",
        args: [Buffer.from("orphaned")],
      },
    ]);

    const restarted = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry: ctx.entityRegistry,
      logger: createSilentLogger(),
      jobQueueService: createMockJobQueueService(),
      dbConfig: ctx.dbConfig,
      embeddingDbConfig: ctx.embeddingDbConfig,
    });
    await restarted.initialize();

    expect(await tableCount("asset_uploads")).toBe(0);
    expect(await tableCount("asset_chunks")).toBe(0);
  });

  test("restores entity references and bytes from one SQLite snapshot", async () => {
    const source = randomBytes(ASSET_CHUNK_BYTES + 3);
    const asset = await ctx.entityService.stageAsset(source);
    await ctx.entityService.createEntity({
      entity: entityForAsset("snapshot", asset),
      stagedAsset: asset,
    });

    await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    const sourcePath = fileURLToPath(ctx.dbConfig.url);
    const backupPath = `${sourcePath}.backup`;
    await client.execute(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);

    const backup = createClient({ url: `file:${backupPath}` });
    try {
      const quickCheck = await backup.execute("PRAGMA quick_check");
      expect(quickCheck.rows[0]?.["quick_check"]).toBe("ok");
      const restored = await backup.execute({
        sql: `SELECT e.content, a.size_bytes, c.bytes
          FROM entities e
          JOIN assets a ON a.digest = substr(e.content, length('asset://sha256/') + 1)
          JOIN asset_chunks c ON c.upload_id = a.upload_id
          WHERE e.entityType = ? AND e.id = ?
          ORDER BY c.ordinal`,
        args: ["test", "snapshot"],
      });
      expect(restored.rows).toHaveLength(2);
      expect(restored.rows[0]?.["content"]).toBe(asset.ref);
      expect(Number(restored.rows[0]?.["size_bytes"])).toBe(source.byteLength);
      const restoredBytes = Buffer.concat(
        restored.rows.map((row) => {
          const bytes = row["bytes"];
          if (!(bytes instanceof ArrayBuffer)) {
            throw new Error("Restored asset chunk was not a SQLite BLOB");
          }
          return Buffer.from(bytes);
        }),
      );
      expect(restoredBytes).toEqual(source);
    } finally {
      backup.close();
    }
  });
  describe("binary content read modes", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

    async function createAssetEntity(
      id: string,
      metadata: Record<string, unknown>,
    ): Promise<StagedAsset> {
      const asset = await ctx.entityService.stageAsset(bytes);
      await ctx.entityService.createEntity({
        entity: createTestEntity("test", { id, content: asset.ref, metadata }),
        stagedAsset: asset,
      });
      return asset;
    }

    test("materializes asset-backed content as a data URL by default", async () => {
      await createAssetEntity("legacy-reader", { mediaType: "image/png" });
      const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;

      const raw = await ctx.entityService.getEntityRaw({
        entityType: "test",
        id: "legacy-reader",
      });
      const resolved = await ctx.entityService.getEntity({
        entityType: "test",
        id: "legacy-reader",
      });
      const listed = await ctx.entityService.listEntities({
        entityType: "test",
      });

      expect(raw?.content).toBe(dataUrl);
      expect(resolved?.content).toBe(dataUrl);
      expect(listed.map((entity) => entity.content)).toEqual([dataUrl]);
    });

    test("returns the stored reference in reference mode", async () => {
      const asset = await createAssetEntity("reference-reader", {
        mediaType: "image/png",
      });

      const raw = await ctx.entityService.getEntityRaw({
        entityType: "test",
        id: "reference-reader",
        binaryContent: "reference",
      });
      const resolved = await ctx.entityService.getEntity({
        entityType: "test",
        id: "reference-reader",
        binaryContent: "reference",
      });

      expect(raw?.content).toBe(asset.ref);
      expect(resolved?.content).toBe(asset.ref);
    });

    test("materializes bytes without a recorded media type as octet-stream", async () => {
      await createAssetEntity("untyped", {});

      const raw = await ctx.entityService.getEntityRaw({
        entityType: "test",
        id: "untyped",
      });

      expect(raw?.content).toBe(
        `data:application/octet-stream;base64,${bytes.toString("base64")}`,
      );
    });

    test("counts legacy materializations by method and entity type", async () => {
      await createAssetEntity("counted", { mediaType: "image/png" });
      await ctx.entityService.createEntity({
        entity: createTestEntity("test", {
          id: "inline-counted",
          content: "data:image/png;base64,AAAA",
        }),
      });

      await ctx.entityService.getEntityRaw({
        entityType: "test",
        id: "counted",
      });
      await ctx.entityService.getEntity({ entityType: "test", id: "counted" });
      await ctx.entityService.listEntities({ entityType: "test" });
      await ctx.entityService.getEntityRaw({
        entityType: "test",
        id: "counted",
        binaryContent: "reference",
      });

      // Reference reads and inline rows never count; only asset loads do.
      expect(ctx.entityService.getLegacyBinaryMaterializations()).toEqual([
        { method: "getEntityRaw", entityType: "test", count: 2 },
        { method: "listEntities", entityType: "test", count: 1 },
      ]);
    });

    test("leaves legacy inline content unchanged in both modes", async () => {
      const inline = "data:image/png;base64,AAAA";
      await ctx.entityService.createEntity({
        entity: createTestEntity("test", { id: "inline", content: inline }),
      });

      const legacy = await ctx.entityService.getEntityRaw({
        entityType: "test",
        id: "inline",
      });
      const reference = await ctx.entityService.getEntityRaw({
        entityType: "test",
        id: "inline",
        binaryContent: "reference",
      });

      expect(legacy?.content).toBe(inline);
      expect(reference?.content).toBe(inline);
    });
  });
});
