import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteDatabase } from "@brains/db";
import { createSilentLogger } from "@brains/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateEntities } from "../src/migrate";

describe("Turso entity database cutover", () => {
  const directories: string[] = [];
  const previousEngine = process.env["BRAINS_DB_ENGINE"];

  afterEach(async () => {
    if (previousEngine === undefined) {
      delete process.env["BRAINS_DB_ENGINE"];
    } else {
      process.env["BRAINS_DB_ENGINE"] = previousEngine;
    }
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  test("removes legacy search schema across an engine round trip without touching the legacy embedding file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "brains-turso-cutover-"));
    directories.push(directory);
    const entityConfig = { url: `file:${join(directory, "entities.db")}` };
    const legacyEmbeddingUrl = `file:${join(directory, "embeddings.db")}`;
    const logger = createSilentLogger();

    process.env["BRAINS_DB_ENGINE"] = "libsql";
    await migrateEntities(entityConfig, logger);

    const entityLibsql = createSqliteDatabase({
      url: entityConfig.url,
      schema: {},
      engine: "libsql",
    });
    try {
      await entityLibsql.client.execute(`
        CREATE VIRTUAL TABLE entity_fts USING fts5(
          entity_id UNINDEXED,
          entity_type UNINDEXED,
          content
        )
      `);
      await entityLibsql.client.execute({
        sql: `INSERT INTO entities (
          id, entityType, content, contentHash, visibility,
          metadata, created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "existing-note",
          "note",
          "Existing production content",
          "existing-hash",
          "public",
          "{}",
          1,
          1,
        ],
      });
      await entityLibsql.client.execute(
        `INSERT INTO entity_fts (entity_id, entity_type, content)
         VALUES ('existing-note', 'note', 'Existing production content')`,
      );
      await entityLibsql.client.execute(`
        CREATE INDEX embeddings_embedding_idx
        ON embeddings(libsql_vector_idx(embedding))
      `);
      await entityLibsql.client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      entityLibsql.client.close();
    }

    const legacy = createSqliteDatabase({
      url: legacyEmbeddingUrl,
      schema: {},
      engine: "libsql",
    });
    try {
      await legacy.client.execute(`CREATE TABLE embeddings (
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        embedding F32_BLOB(4) NOT NULL,
        content_hash TEXT NOT NULL,
        PRIMARY KEY (entity_id, entity_type)
      )`);
      await legacy.client.execute({
        sql: "INSERT INTO embeddings VALUES (?, ?, vector32(?), ?)",
        args: [
          "existing-note",
          "note",
          JSON.stringify([0.1, 0.2, 0.3, 0.4]),
          "existing-hash",
        ],
      });
      await legacy.client.execute(`
        CREATE INDEX embeddings_embedding_idx
        ON embeddings(libsql_vector_idx(embedding))
      `);
      await legacy.client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      legacy.client.close();
    }

    process.env["BRAINS_DB_ENGINE"] = "turso";
    await migrateEntities(entityConfig, logger);

    const entityTurso = createSqliteDatabase({
      url: entityConfig.url,
      schema: {},
      engine: "turso",
    });
    try {
      const entity = await entityTurso.client.execute(
        "SELECT content FROM entities WHERE id = 'existing-note'",
      );
      expect(entity.rows[0]?.["content"]).toBe("Existing production content");

      const indexes = await entityTurso.client.execute(
        `SELECT name FROM sqlite_master
         WHERE name IN (
           'entity_fts',
           'entities_content_fts',
           'embeddings_embedding_idx'
         )`,
      );
      expect(indexes.rows).toEqual([]);

      // Simulate a database restored from a release that still used native
      // Turso FTS. The next migration must remove it before normal startup.
      await entityTurso.client.execute(`
        CREATE INDEX entities_content_fts
        ON entities USING fts (content)
      `);
    } finally {
      entityTurso.client.close();
    }

    process.env["BRAINS_DB_ENGINE"] = "libsql";
    await migrateEntities(entityConfig, logger);
    const cleanedLibsql = createSqliteDatabase({
      url: entityConfig.url,
      schema: {},
      engine: "libsql",
    });
    try {
      const entity = await cleanedLibsql.client.execute(
        "SELECT content FROM entities WHERE id = 'existing-note'",
      );
      expect(entity.rows[0]?.["content"]).toBe("Existing production content");
      const searchSchema = await cleanedLibsql.client.execute(
        `SELECT name FROM sqlite_master
         WHERE name LIKE '__turso_internal_fts_%'
            OR name IN ('entity_fts', 'entities_content_fts')`,
      );
      expect(searchSchema.rows).toEqual([]);
    } finally {
      cleanedLibsql.client.close();
    }

    const unchangedLegacy = createSqliteDatabase({
      url: legacyEmbeddingUrl,
      schema: {},
      engine: "libsql",
    });
    try {
      const rows = await unchangedLegacy.client.execute(
        "SELECT content_hash FROM embeddings",
      );
      expect(rows.rows[0]?.["content_hash"]).toBe("existing-hash");
      const indexes = await unchangedLegacy.client.execute(
        "SELECT name FROM sqlite_master WHERE name = 'embeddings_embedding_idx'",
      );
      expect(indexes.rows).toHaveLength(1);
    } finally {
      unchangedLegacy.client.close();
    }
  });
});
