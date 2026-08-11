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

  test("upgrades released libSQL schema and switches back without data loss", async () => {
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

      const searchSchema = await entityTurso.client.execute(
        "SELECT name FROM sqlite_master WHERE name = 'entity_fts'",
      );
      expect(searchSchema.rows).toEqual([]);

      await entityTurso.client.execute({
        sql: `INSERT INTO embeddings
          (entity_id, entity_type, embedding, content_hash)
          VALUES (?, ?, vector32(?), ?)`,
        args: [
          "existing-note",
          "note",
          JSON.stringify([0.1, 0.2]),
          "existing-hash",
        ],
      });
      await entityTurso.client.execute({
        sql: `INSERT INTO entity_job_outbox (id, request, created_at)
          VALUES (?, ?, ?)`,
        args: [
          "roundtrip-intent",
          JSON.stringify({
            type: "generate-embedding",
            data: { entityId: "existing-note", entityType: "note" },
            idempotencyKey: "roundtrip-intent",
          }),
          2,
        ],
      });
      await entityTurso.client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      entityTurso.client.close();
    }

    process.env["BRAINS_DB_ENGINE"] = "libsql";
    await migrateEntities(entityConfig, logger);

    const fallback = createSqliteDatabase({
      url: entityConfig.url,
      schema: {},
      engine: "libsql",
    });
    try {
      const matches = await fallback.client.execute({
        sql: `SELECT id FROM entities
          WHERE instr(lower(content), lower(?)) > 0`,
        args: ["production content"],
      });
      expect(matches.rows).toEqual([
        expect.objectContaining({ id: "existing-note" }),
      ]);

      const embeddings = await fallback.client.execute(
        "SELECT content_hash FROM embeddings WHERE entity_id = 'existing-note'",
      );
      expect(embeddings.rows[0]?.["content_hash"]).toBe("existing-hash");

      const outbox = await fallback.client.execute(
        "SELECT request FROM entity_job_outbox WHERE id = 'roundtrip-intent'",
      );
      expect(String(outbox.rows[0]?.["request"])).toContain(
        '"idempotencyKey":"roundtrip-intent"',
      );

      const searchSchema = await fallback.client.execute(
        "SELECT name FROM sqlite_master WHERE name = 'entity_fts'",
      );
      expect(searchSchema.rows).toEqual([]);
    } finally {
      fallback.client.close();
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
