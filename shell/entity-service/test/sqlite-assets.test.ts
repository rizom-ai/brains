import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Client } from "@libsql/client";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { assets } from "../src/schema/assets";
import { closeSqliteClient, createSqliteDatabase } from "@brains/db";
import {
  MAX_ASSET_BYTES,
  prepareAsset,
  type PreparedAsset,
} from "@brains/assets";
import { createTestEntity } from "@brains/test-utils";
import { fileURLToPath } from "node:url";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import type { BaseEntity, OwnedAssetPublication } from "../src";
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
    client = createSqliteDatabase({ url: ctx.dbConfig.url, schema: {} }).client;
  });

  afterEach(async () => {
    await closeSqliteClient(client);
    await ctx.cleanup();
  });

  function entityForAsset(id: string, asset: PreparedAsset): BaseEntity {
    return createTestEntity("test", {
      id,
      content: asset.ref,
      metadata: { sizeBytes: asset.sizeBytes },
    });
  }

  async function tableCount(
    table:
      "assets" | "entities" | "entity_export_intents" | "entity_job_outbox",
  ): Promise<number> {
    const result = await client.execute(
      `SELECT count(*) AS count FROM ${table}`,
    );
    return Number(result.rows[0]?.["count"] ?? 0);
  }

  // Database-local zero generation isolates the real entity transaction binding.
  // The file producer/worker-backed adapter is validated separately.
  function zeroPublication(size: number): {
    asset: PreparedAsset;
    publication: OwnedAssetPublication;
  } {
    const asset = prepareAsset(new Uint8Array(size));
    const publication: OwnedAssetPublication = {
      record: { ref: asset.ref, digest: asset.digest, sizeBytes: size },
      run: <T>(operation: () => Promise<T>): Promise<T> => operation(),
      bind: async (transaction, createdAt): Promise<void> => {
        await transaction.insert(assets).values({
          digest: asset.digest,
          bytes: sql`zeroblob(${size})`,
          sizeBytes: size,
          created: createdAt,
        });
      },
    };
    return { asset, publication };
  }

  test("owner publications bind inside real create, update and upsert mutations and cannot be replayed", async () => {
    const first = zeroPublication(1);
    await ctx.entityService.createEntityWithPublication(first.publication, {
      entity: entityForAsset("owned", first.asset),
    });
    await assert.rejects(
      ctx.entityService.createEntityWithPublication(first.publication, {
        entity: entityForAsset("replay", first.asset),
      }),
      /already consumed/,
    );
    const second = zeroPublication(2);
    await ctx.entityService.updateEntityWithPublication(second.publication, {
      entity: entityForAsset("owned", second.asset),
    });
    const third = zeroPublication(3);
    const inserted = await ctx.entityService.upsertEntityWithPublication(
      third.publication,
      { entity: entityForAsset("upsert-owned", third.asset) },
    );
    assert.equal(inserted.created, true);
    const fourth = zeroPublication(4);
    const updated = await ctx.entityService.upsertEntityWithPublication(
      fourth.publication,
      { entity: entityForAsset("upsert-owned", fourth.asset) },
    );
    assert.equal(updated.created, false);
    assert.equal(await tableCount("assets"), 4);
    assert.equal(await tableCount("entities"), 2);
    assert.equal(
      (await ctx.entityService.verifyAsset(fourth.asset.ref)).valid,
      true,
    );
  });

  test("a late projection journal failure rolls back the publication and entity together", async () => {
    const { asset, publication } = zeroPublication(1);
    await client.execute("DROP TABLE projection_dirty_inputs");
    await assert.rejects(
      ctx.entityService.createEntityWithPublication(publication, {
        entity: entityForAsset("late-failure", asset),
      }),
    );
    assert.equal(await tableCount("assets"), 0);
    assert.equal(await tableCount("entities"), 0);
    assert.equal(await tableCount("entity_export_intents"), 0);
    assert.equal(await tableCount("entity_job_outbox"), 0);
    await assert.rejects(
      ctx.entityService.createEntityWithPublication(publication, {
        entity: entityForAsset("retry", asset),
      }),
      /already consumed/,
    );
  });

  test("snapshots publication metadata before entering an asynchronous owner lifetime", async () => {
    const first = zeroPublication(1);
    const other = zeroPublication(2);
    const mutable = { ...first.publication.record };
    const publication: OwnedAssetPublication = {
      ...first.publication,
      record: mutable,
      run: <T>(operation: () => Promise<T>): Promise<T> => {
        Object.assign(mutable, other.publication.record);
        return operation();
      },
    };
    await ctx.entityService.createEntityWithPublication(publication, {
      entity: entityForAsset("snapshot", first.asset),
    });
    expect((await ctx.entityService.verifyAsset(first.asset.ref)).valid).toBe(
      true,
    );
    expect(await ctx.entityService.statAsset(other.asset.ref)).toBeNull();
  });

  test("does not publish an entity if its owner binding fails to create the asset", async () => {
    const { asset, publication } = zeroPublication(1);
    await assert.rejects(
      ctx.entityService.createEntityWithPublication(
        { ...publication, bind: async () => {} },
        { entity: entityForAsset("unbound", asset) },
      ),
      /Asset not found/,
    );
    assert.equal(await tableCount("assets"), 0);
    assert.equal(await tableCount("entities"), 0);
  });

  test("rejects publication metadata mismatches inside the transaction", async () => {
    const { asset, publication } = zeroPublication(1);
    await assert.rejects(
      ctx.entityService.createEntityWithPublication(
        {
          ...publication,
          bind: async (transaction, createdAt): Promise<void> => {
            await transaction.insert(assets).values({
              digest: asset.digest,
              bytes: sql`zeroblob(2)`,
              sizeBytes: 2,
              created: createdAt,
            });
          },
        },
        { entity: entityForAsset("wrong-size", asset) },
      ),
      /storage type or size/,
    );
    assert.equal(await tableCount("assets"), 0);
    assert.equal(await tableCount("entities"), 0);
  });

  test("preserves admission and owner retirement failures without allocating an oversized payload", async () => {
    const { asset, publication } = zeroPublication(1);
    const cleanup = new Error("owner retirement uncertain");
    await assert.rejects(
      ctx.entityService.createEntityWithPublication(
        {
          ...publication,
          record: { ...publication.record, sizeBytes: MAX_ASSET_BYTES + 1 },
          run: () => Promise.reject(cleanup),
        },
        { entity: entityForAsset("oversized", asset) },
      ),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        const primary: unknown = error.errors[0];
        assert.ok(primary instanceof Error);
        assert.match(primary.message, /exceeds repository capacity/);
        assert.equal(error.errors[1], cleanup);
        assert.equal(error.cause, cleanup);
        return true;
      },
    );
    assert.equal(await tableCount("assets"), 0);
    assert.equal(await tableCount("entities"), 0);
  });

  test("the publication path refuses mixed buffers and mismatched references without falling back", async () => {
    const first = zeroPublication(1);
    const request = {
      entity: entityForAsset("mixed", first.asset),
      preparedAsset: first.asset,
    };
    await assert.rejects(
      ctx.entityService.createEntityWithPublication(first.publication, request),
      /cannot be mixed/,
    );
    const second = zeroPublication(2);
    await assert.rejects(
      ctx.entityService.createEntityWithPublication(second.publication, {
        entity: entityForAsset("mismatched", first.asset),
      }),
      /does not match/,
    );
    assert.equal(await tableCount("assets"), 0);
    assert.equal(await tableCount("entities"), 0);
  });

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

    const backup = createSqliteDatabase({
      url: `file:${backupPath}`,
      schema: {},
    }).client;
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
      const restoredBytes: unknown = restored.rows[0]?.["bytes"];
      if (
        !(restoredBytes instanceof ArrayBuffer) &&
        !(restoredBytes instanceof Uint8Array)
      ) {
        throw new Error("Restored asset bytes were not a SQLite BLOB");
      }
      const restoredBuffer =
        restoredBytes instanceof ArrayBuffer
          ? Buffer.from(restoredBytes)
          : Buffer.from(restoredBytes);
      expect(restoredBuffer).toEqual(Buffer.from(asset.bytes));
      expect(Number(restored.rows[0]?.["size_bytes"])).toBe(asset.sizeBytes);
    } finally {
      await closeSqliteClient(backup);
    }
  });
});
