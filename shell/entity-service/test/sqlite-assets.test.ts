import { createTestEntity } from "../src/test/index";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { prepareAsset, type PreparedAsset } from "@brains/assets";
import { fileURLToPath } from "node:url";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import type { BaseEntity } from "../src";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";

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
    client = createClient({ url: ctx.dbConfig.url });
  });

  afterEach(async () => {
    client.close();
    await ctx.cleanup();
  });

  function entityForAsset(id: string, asset: PreparedAsset): BaseEntity {
    return createTestEntity("test", {
      id,
      content: asset.ref,
      metadata: { sizeBytes: asset.sizeBytes },
    });
  }

  async function tableCount(table: "assets" | "entities"): Promise<number> {
    const result = await client.execute(
      `SELECT count(*) AS count FROM ${table}`,
    );
    return Number(result.rows[0]?.["count"] ?? 0);
  }

  test("commits bytes and their entity reference atomically", async () => {
    const source = Uint8Array.from([0, 1, 2, 3, 255]);
    const asset = prepareAsset(source);

    await ctx.entityService.createEntity({
      entity: entityForAsset("atomic-create", asset),
      preparedAsset: asset,
    });

    expect(await ctx.entityService.statAsset(asset.ref)).toEqual({
      ref: asset.ref,
      sizeBytes: source.byteLength,
    });
    expect(await ctx.entityService.readAsset(asset.ref)).toEqual(source);
    expect(await ctx.entityService.verifyAsset(asset.ref)).toEqual(
      expect.objectContaining({
        ref: asset.ref,
        expectedDigest: asset.digest,
        actualDigest: asset.digest,
        valid: true,
      }),
    );

    const listed = await ctx.entityService.listEntities({ entityType: "test" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.content).toBe(asset.ref);
    expect(JSON.stringify(listed)).not.toContain(source.toString());

    const fts = await client.execute(
      "SELECT count(*) AS count FROM entity_fts WHERE entity_type = 'test'",
    );
    expect(Number(fts.rows[0]?.["count"] ?? 0)).toBe(0);
  });

  test("deduplicates concurrent references to identical bytes", async () => {
    const asset = prepareAsset(Buffer.from("shared immutable bytes"));

    await Promise.all([
      ctx.entityService.createEntity({
        entity: entityForAsset("dedupe-a", asset),
        preparedAsset: asset,
      }),
      ctx.entityService.createEntity({
        entity: entityForAsset("dedupe-b", asset),
        preparedAsset: asset,
      }),
    ]);

    expect(await tableCount("assets")).toBe(1);
    expect(await tableCount("entities")).toBe(2);
  });

  test("keeps projection writes behind asset existence and FTS policy", async () => {
    const asset = prepareAsset(Buffer.from("projection source bytes"));
    await ctx.entityService.createEntity({
      entity: entityForAsset("asset-seed", asset),
      preparedAsset: asset,
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

  test("rolls back a new asset when entity persistence fails", async () => {
    const existing = prepareAsset(Buffer.from("already committed"));
    await ctx.entityService.createEntity({
      entity: entityForAsset("duplicate-id", existing),
      preparedAsset: existing,
    });

    const rejected = prepareAsset(Buffer.from("must roll back"));
    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("duplicate-id", rejected),
        preparedAsset: rejected,
      }),
    ).rejects.toThrow();

    expect(await ctx.entityService.statAsset(existing.ref)).not.toBeNull();
    expect(await ctx.entityService.statAsset(rejected.ref)).toBeNull();
    expect(await tableCount("assets")).toBe(1);
  });

  test("refuses to publish an absent or mismatched asset reference", async () => {
    const asset = prepareAsset(Buffer.from("canonical bytes"));
    const missing = prepareAsset(Buffer.from("not committed"));

    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("absent", missing),
      }),
    ).rejects.toThrow(`Asset not found: ${missing.ref}`);

    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("mismatch", missing),
        preparedAsset: asset,
      }),
    ).rejects.toThrow("does not match canonical test content");

    expect(await tableCount("assets")).toBe(0);
    expect(await tableCount("entities")).toBe(0);
  });

  test("fails closed when a duplicate digest row contains different bytes", async () => {
    const asset = prepareAsset(Buffer.from("expected payload"));
    const corrupted = Buffer.from("corrupt payload!");
    expect(corrupted.byteLength).toBe(asset.sizeBytes);
    await client.execute({
      sql: "INSERT INTO assets (digest, bytes, size_bytes, created) VALUES (?, ?, ?, ?)",
      args: [asset.digest, corrupted, corrupted.byteLength, Date.now()],
    });

    expect(
      ctx.entityService.createEntity({
        entity: entityForAsset("corrupt-duplicate", asset),
        preparedAsset: asset,
      }),
    ).rejects.toThrow("Asset integrity check failed");

    expect(await tableCount("entities")).toBe(0);
    expect((await ctx.entityService.verifyAsset(asset.ref)).valid).toBe(false);
  });

  test("restores entity references and bytes from one SQLite snapshot", async () => {
    const asset = prepareAsset(Buffer.from("snapshot payload"));
    await ctx.entityService.createEntity({
      entity: entityForAsset("snapshot", asset),
      preparedAsset: asset,
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
        sql: `SELECT e.content, a.bytes, a.size_bytes
          FROM entities e
          JOIN assets a ON a.digest = substr(e.content, length('asset://sha256/') + 1)
          WHERE e.entityType = ? AND e.id = ?`,
        args: ["test", "snapshot"],
      });
      expect(restored.rows).toHaveLength(1);
      expect(restored.rows[0]?.["content"]).toBe(asset.ref);
      const restoredBytes = restored.rows[0]?.["bytes"];
      if (!(restoredBytes instanceof ArrayBuffer)) {
        throw new Error("Restored asset bytes were not a SQLite BLOB");
      }
      expect(Buffer.from(restoredBytes)).toEqual(Buffer.from(asset.bytes));
      expect(Number(restored.rows[0]?.["size_bytes"])).toBe(asset.sizeBytes);
    } finally {
      backup.close();
    }
  });
});
