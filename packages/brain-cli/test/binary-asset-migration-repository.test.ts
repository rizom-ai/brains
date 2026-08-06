import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeContentHash } from "@brains/utils/hash";
import { SqliteBinaryAssetMigrationRepository } from "../src/lib/binary-asset-migration-repository";
import type { BinaryEntityUpdate } from "../src/lib/binary-asset-migration";
import { createAssetRef } from "@brains/assets";

const ASSET_REF = createAssetRef("a".repeat(64));

interface StoredRow {
  content: string;
  contentHash: string;
  metadata: string;
  visibility: string;
  created: number;
  updated: number;
}

interface CountRow {
  count: number;
}

function update(id: string, expectedContentHash: string): BinaryEntityUpdate {
  return {
    id,
    entityType: "image",
    expectedContentHash,
    content: ASSET_REF,
    contentHash: computeContentHash(ASSET_REF),
    metadata: { mediaType: "image/png", sizeBytes: 10 },
  };
}

describe("SQLite binary asset migration repository", () => {
  let directory: string;
  let databasePath: string;
  let database: Database;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "binary-asset-repository-"));
    databasePath = join(directory, "brain.db");
    database = new Database(databasePath, { create: true, strict: true });
    database.exec(`
      CREATE TABLE entities (
        id TEXT NOT NULL,
        entityType TEXT NOT NULL,
        content TEXT NOT NULL,
        contentHash TEXT NOT NULL,
        visibility TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        PRIMARY KEY (id, entityType)
      );
      CREATE VIRTUAL TABLE entity_fts USING fts5(
        entity_id UNINDEXED,
        entity_type UNINDEXED,
        content
      );
    `);
  });

  afterEach(() => {
    database.close(false);
    rmSync(directory, { recursive: true, force: true });
  });

  function insertImage(id: string, contentHash = `${id}-hash`): void {
    database
      .query(
        `INSERT INTO entities
          (id, entityType, content, contentHash, visibility, metadata, created, updated)
         VALUES (?, 'image', ?, ?, 'restricted', ?, 100, 200)`,
      )
      .run(
        id,
        `data:image/png;base64,${id}`,
        contentHash,
        JSON.stringify({ title: id }),
      );
    database
      .query(
        "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (?, 'image', ?)",
      )
      .run(id, `indexed-${id}`);
  }

  test("refuses non-file database URLs", () => {
    expect(
      () =>
        new SqliteBinaryAssetMigrationRepository({
          databaseUrl: "libsql://database.example.com",
        }),
    ).toThrow("local file: SQLite");
  });

  test("reads normalized image rows without changing the database", async () => {
    insertImage("hero");
    const repository = new SqliteBinaryAssetMigrationRepository({
      databaseUrl: `file:${databasePath}`,
    });

    const rows = await repository.listRows("image");

    expect(rows).toEqual([
      {
        id: "hero",
        entityType: "image",
        content: "data:image/png;base64,hero",
        contentHash: "hero-hash",
        visibility: "restricted",
        metadata: { title: "hero" },
        created: 100,
        updated: 200,
      },
    ]);
  });

  test("updates only binary fields and deletes FTS rows in one transaction", async () => {
    insertImage("hero");
    const repository = new SqliteBinaryAssetMigrationRepository({
      databaseUrl: `file:${databasePath}`,
    });

    await repository.applyUpdates(
      [update("hero", "hero-hash")],
      [{ id: "hero", entityType: "image" }],
    );

    const row = database
      .query<StoredRow, [string, string]>(
        `SELECT content, contentHash, metadata, visibility, created, updated
         FROM entities WHERE id = ? AND entityType = ?`,
      )
      .get("hero", "image");
    const fts = database
      .query<CountRow, [string]>(
        "SELECT count(*) AS count FROM entity_fts WHERE entity_id = ?",
      )
      .get("hero");

    expect(row).toEqual({
      content: ASSET_REF,
      contentHash: computeContentHash(ASSET_REF),
      metadata: JSON.stringify({ mediaType: "image/png", sizeBytes: 10 }),
      visibility: "restricted",
      created: 100,
      updated: 200,
    });
    expect(fts?.count).toBe(0);
  });

  test("rolls back every row and FTS deletion on stale content", async () => {
    insertImage("one");
    insertImage("two");
    const repository = new SqliteBinaryAssetMigrationRepository({
      databaseUrl: `file:${databasePath}`,
    });

    expect(
      repository.applyUpdates(
        [update("one", "one-hash"), update("two", "stale-hash")],
        [
          { id: "one", entityType: "image" },
          { id: "two", entityType: "image" },
        ],
      ),
    ).rejects.toThrow("changed after migration analysis");

    const rows = database
      .query<{ id: string; contentHash: string }, []>(
        "SELECT id, contentHash FROM entities ORDER BY id",
      )
      .all();
    const fts = database
      .query<CountRow, []>("SELECT count(*) AS count FROM entity_fts")
      .get();
    expect(rows).toEqual([
      { id: "one", contentHash: "one-hash" },
      { id: "two", contentHash: "two-hash" },
    ]);
    expect(fts?.count).toBe(2);
  });

  test("exclusive lock probing fails while another writer holds the database", async () => {
    database.exec("BEGIN IMMEDIATE");
    const repository = new SqliteBinaryAssetMigrationRepository({
      databaseUrl: `file:${databasePath}`,
    });

    expect(repository.probeExclusiveLock()).rejects.toThrow(
      "exclusive SQLite lock",
    );

    database.exec("ROLLBACK");
  });
});
