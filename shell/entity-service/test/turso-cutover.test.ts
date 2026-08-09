import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteDatabase } from "@brains/db";
import { createSilentLogger } from "@brains/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateEmbeddingDatabase } from "../src/db/embedding-db";
import { migrateEntities } from "../src/migrate";

const EMBEDDING_DIMENSIONS = 4;

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

  test("opens populated WAL databases after removing libSQL-only schema", async () => {
    const directory = await mkdtemp(join(tmpdir(), "brains-turso-cutover-"));
    directories.push(directory);
    const entityConfig = { url: `file:${join(directory, "entities.db")}` };
    const embeddingConfig = {
      url: `file:${join(directory, "embeddings.db")}`,
    };
    const logger = createSilentLogger();

    process.env["BRAINS_DB_ENGINE"] = "libsql";
    await migrateEntities(entityConfig, logger);

    const entityLibsql = createSqliteDatabase({
      url: entityConfig.url,
      schema: {},
      engine: "libsql",
    });
    try {
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

    const embeddingLibsql = createSqliteDatabase({
      url: embeddingConfig.url,
      schema: {},
      engine: "libsql",
    });
    try {
      await embeddingLibsql.client.execute("PRAGMA journal_mode = WAL");
      await migrateEmbeddingDatabase(
        embeddingLibsql.client,
        EMBEDDING_DIMENSIONS,
      );
      await embeddingLibsql.client.execute({
        sql: `INSERT INTO embeddings
          VALUES ('existing-note', 'note', vector32(?), 'existing-hash')`,
        args: [JSON.stringify([0.1, 0.2, 0.3, 0.4])],
      });
      await embeddingLibsql.client.execute(`
        CREATE INDEX embeddings_embedding_idx
        ON embeddings(libsql_vector_idx(embedding))
      `);
      await embeddingLibsql.client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      embeddingLibsql.client.close();
    }

    process.env["BRAINS_DB_ENGINE"] = "turso";
    await migrateEntities(entityConfig, logger, embeddingConfig);

    const entityTurso = createSqliteDatabase({
      url: entityConfig.url,
      schema: {},
      engine: "turso",
    });
    const embeddingTurso = createSqliteDatabase({
      url: embeddingConfig.url,
      schema: {},
      engine: "turso",
    });
    try {
      const entity = await entityTurso.client.execute(
        "SELECT content FROM entities WHERE id = 'existing-note'",
      );
      expect(entity.rows[0]?.["content"]).toBe("Existing production content");

      const entityIndexes = await entityTurso.client.execute(
        `SELECT name FROM sqlite_master
         WHERE name IN (
           'entity_fts',
           'entities_content_fts',
           'embeddings_embedding_idx'
         )`,
      );
      expect(entityIndexes.rows.map((row) => row["name"])).toEqual([
        "entities_content_fts",
      ]);

      const embedding = await embeddingTurso.client.execute(
        "SELECT content_hash FROM embeddings WHERE entity_id = 'existing-note'",
      );
      expect(embedding.rows[0]?.["content_hash"]).toBe("existing-hash");

      const legacyIndex = await embeddingTurso.client.execute(
        `SELECT name FROM sqlite_master
         WHERE name = 'embeddings_embedding_idx'`,
      );
      expect(legacyIndex.rows).toEqual([]);
    } finally {
      embeddingTurso.client.close();
      entityTurso.client.close();
    }
  });
});
