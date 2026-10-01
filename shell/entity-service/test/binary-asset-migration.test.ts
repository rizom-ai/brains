import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createAssetRef, computeAssetDigest } from "@brains/assets";
import { computeContentHash } from "@brains/utils/hash";
import { ensureFtsTable } from "../src/db";
import { openOfflineEntityDatabase } from "../src/offline/binary-asset-inventory";
import { OfflineBinaryMigrator } from "../src/offline/binary-asset-migration";
import {
  createTestEntityDatabase,
  type TestEntityDatabase,
} from "./helpers/test-entity-db";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const inline = `data:image/png;base64,${PNG.toString("base64")}`;
const ref = createAssetRef(computeAssetDigest(PNG));
const facts = {
  format: "png",
  mediaType: "image/png",
  sizeBytes: PNG.byteLength,
  width: 1,
  height: 1,
};

describe("OfflineBinaryMigrator", () => {
  let database: TestEntityDatabase;
  let connection: ReturnType<typeof openOfflineEntityDatabase>;
  let migrator: OfflineBinaryMigrator;

  async function insertImage(id: string, content = inline): Promise<void> {
    await connection.client.execute({
      sql: "INSERT INTO entities (id, entityType, content, contentHash, visibility, metadata, created, updated) VALUES (?, 'image', ?, ?, 'shared', ?, 11, 22)",
      args: [
        id,
        content,
        `hash-${id}`,
        JSON.stringify({ title: `Title ${id}`, format: "jpg", width: 9 }),
      ],
    });
    await connection.client.execute({
      sql: "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (?, 'image', ?)",
      args: [id, content],
    });
  }

  async function row(id: string): Promise<Record<string, unknown>> {
    const result = await connection.client.execute({
      sql: "SELECT * FROM entities WHERE entityType = 'image' AND id = ?",
      args: [id],
    });
    return { ...result.rows[0] };
  }

  async function count(sql: string): Promise<number> {
    return Number((await connection.client.execute(sql)).rows[0]?.[0]);
  }

  const input = (
    id: string,
  ): Parameters<OfflineBinaryMigrator["migrateRow"]>[1] => ({
    id,
    expectedContentHash: `hash-${id}`,
    bytes: PNG,
    expectedSize: PNG.byteLength,
    metadata: facts,
  });

  beforeEach(async () => {
    database = await createTestEntityDatabase();
    connection = openOfflineEntityDatabase(
      database.config.url.slice("file:".length),
    );
    await ensureFtsTable(connection.client);
    migrator = new OfflineBinaryMigrator(connection);
  });

  afterEach(async () => {
    connection.client.close();
    await database.cleanup();
  });

  it("replaces inline content with a published reference and keeps the row's identity", async () => {
    await insertImage("cover");

    const outcome = await migrator.migrateRow("image", input("cover"));

    expect(outcome).toEqual({
      outcome: "migrated",
      ref,
      contentHash: computeContentHash(ref),
    });
    const migrated = await row("cover");
    expect(migrated["content"]).toBe(ref);
    expect(migrated["contentHash"]).toBe(computeContentHash(ref));
    expect(migrated["visibility"]).toBe("shared");
    expect(migrated["created"]).toBe(11);
    expect(migrated["updated"]).toBe(22);
    expect(JSON.parse(String(migrated["metadata"]))).toEqual({
      title: "Title cover",
      ...facts,
    });
    expect(
      await count("SELECT COUNT(*) FROM entity_fts WHERE entity_id = 'cover'"),
    ).toBe(0);
    expect(await count("SELECT COUNT(*) FROM assets")).toBe(1);
  });

  it("publishes shared bytes once for every row that carries them", async () => {
    await insertImage("cover");
    await insertImage("cover-copy");

    await migrator.migrateRow("image", input("cover"));
    await migrator.migrateRow("image", input("cover-copy"));

    expect((await row("cover-copy"))["content"]).toBe(ref);
    expect(await count("SELECT COUNT(*) FROM assets")).toBe(1);
    expect(await count("SELECT COUNT(*) FROM asset_uploads")).toBe(1);
  });

  it("writes nothing for a row that changed since it was read", async () => {
    await insertImage("cover");

    const outcome = await migrator.migrateRow("image", {
      ...input("cover"),
      expectedContentHash: "stale",
    });

    expect(outcome).toEqual({ outcome: "changed" });
    expect((await row("cover"))["content"]).toBe(inline);
    expect(await count("SELECT COUNT(*) FROM assets")).toBe(0);
    expect(await count("SELECT COUNT(*) FROM asset_uploads")).toBe(0);
  });

  it("skips a row that already holds a reference", async () => {
    await insertImage("cover");
    await migrator.migrateRow("image", input("cover"));

    expect(await migrator.migrateRow("image", input("cover"))).toEqual({
      outcome: "changed",
    });
    expect(await count("SELECT COUNT(*) FROM asset_uploads")).toBe(1);
  });

  it("restores the asset behind a reference whose header is gone", async () => {
    await insertImage("cover");
    await migrator.migrateRow("image", input("cover"));
    await connection.client.execute("DELETE FROM asset_chunks");
    await connection.client.execute("DELETE FROM assets");
    await connection.client.execute("DELETE FROM asset_uploads");

    const outcome = await migrator.restoreAsset("image", {
      id: "cover",
      ref,
      bytes: PNG,
      expectedSize: PNG.byteLength,
    });

    expect(outcome).toEqual({ outcome: "restored" });
    expect(await count("SELECT COUNT(*) FROM assets")).toBe(1);
    expect((await row("cover"))["content"]).toBe(ref);
  });

  it("never restores bytes behind a different reference", async () => {
    await insertImage("cover", createAssetRef("c".repeat(64)));

    const outcome = await migrator.restoreAsset("image", {
      id: "cover",
      ref,
      bytes: PNG,
      expectedSize: PNG.byteLength,
    });

    expect(outcome).toEqual({ outcome: "changed" });
    expect(await count("SELECT COUNT(*) FROM assets")).toBe(0);
    expect(await count("SELECT COUNT(*) FROM asset_uploads")).toBe(0);
  });

  it("creates a missing row together with its asset", async () => {
    const outcome = await migrator.createRow("image", {
      id: "fresh",
      bytes: PNG,
      expectedSize: PNG.byteLength,
      metadata: facts,
      created: 5,
      updated: 6,
    });

    expect(outcome).toEqual({
      outcome: "created",
      ref,
      contentHash: computeContentHash(ref),
    });
    const created = await row("fresh");
    expect(created["content"]).toBe(ref);
    expect(created["visibility"]).toBe("public");
    expect(created["created"]).toBe(5);
    expect(JSON.parse(String(created["metadata"]))).toEqual(facts);
    expect(await count("SELECT COUNT(*) FROM assets")).toBe(1);
  });

  it("never replaces a row that appeared meanwhile", async () => {
    await insertImage("fresh");

    const outcome = await migrator.createRow("image", {
      id: "fresh",
      bytes: PNG,
      expectedSize: PNG.byteLength,
      metadata: facts,
      created: 5,
      updated: 6,
    });

    expect(outcome).toEqual({ outcome: "changed" });
    expect((await row("fresh"))["content"]).toBe(inline);
    expect(await count("SELECT COUNT(*) FROM asset_uploads")).toBe(0);
  });
});
