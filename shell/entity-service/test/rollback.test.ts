import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteDatabase } from "@brains/db";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { migrateEntities } from "../src/migrate";
import { prepareEntityDatabaseForLibsql } from "../src/rollback";

describe("prepareEntityDatabaseForLibsql", () => {
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

  test("removes native FTS schema and rebuilds the libSQL keyword index", async () => {
    const directory = await mkdtemp(join(tmpdir(), "brains-fts-rollback-"));
    directories.push(directory);
    const config = { url: `file:${join(directory, "entities.db")}` };

    const logger = createSilentLogger();

    process.env["BRAINS_DB_ENGINE"] = "libsql";
    await migrateEntities(config, logger);
    const libsqlSeed = createSqliteDatabase({
      url: config.url,
      schema: {},
      engine: "libsql",
    });
    try {
      await libsqlSeed.client.execute({
        sql: `INSERT INTO entities (
          id, entityType, content, contentHash, visibility,
          metadata, created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "typescript",
          "note",
          "TypeScript is a typed superset of JavaScript",
          "typescript-hash",
          "public",
          "{}",
          1,
          1,
        ],
      });
      await libsqlSeed.client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      libsqlSeed.client.close();
    }

    process.env["BRAINS_DB_ENGINE"] = "turso";
    await migrateEntities(config, logger);
    const tursoSeed = createSqliteDatabase({
      url: config.url,
      schema: {},
      engine: "turso",
    });
    await tursoSeed.client.execute({
      sql: `INSERT INTO embeddings
        (entity_id, entity_type, embedding, content_hash)
        VALUES (?, ?, vector32(?), ?)`,
      args: [
        "typescript",
        "note",
        JSON.stringify([0.1, 0.2]),
        "typescript-hash",
      ],
    });
    tursoSeed.client.close();
    await prepareEntityDatabaseForLibsql(config);

    const libsql = createSqliteDatabase({
      url: config.url,
      schema: {},
      engine: "libsql",
    });
    try {
      const matches = await libsql.client.execute({
        sql: "SELECT entity_id FROM entity_fts WHERE entity_fts MATCH ?",
        args: ['"TypeScript"'],
      });
      expect(matches.rows).toEqual([
        expect.objectContaining({ entity_id: "typescript" }),
      ]);

      const nativeSchema = await libsql.client.execute(
        "SELECT name FROM sqlite_master WHERE name LIKE '__turso_internal_fts_%' OR name = 'entities_content_fts'",
      );
      expect(nativeSchema.rows).toEqual([]);

      const migratedSchema = await libsql.client.execute(
        "SELECT name FROM sqlite_master WHERE name = 'projection_waves'",
      );
      expect(migratedSchema.rows).toHaveLength(1);

      const embeddings = await libsql.client.execute(
        "SELECT content_hash FROM embeddings WHERE entity_id = 'typescript'",
      );
      expect(embeddings.rows[0]?.["content_hash"]).toBe("typescript-hash");
    } finally {
      libsql.client.close();
    }
  });

  test("rejects remote database urls", () => {
    expect(
      prepareEntityDatabaseForLibsql({
        url: "libsql://example.turso.io",
        authToken: "token",
      }),
    ).rejects.toThrow(/only supports file:/);
  });
});
