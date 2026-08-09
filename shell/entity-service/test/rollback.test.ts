import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteDatabase } from "@brains/db";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareEntityDatabaseForLibsql } from "../src/rollback";

describe("prepareEntityDatabaseForLibsql", () => {
  const directories: string[] = [];

  afterEach(async () => {
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

    const turso = createSqliteDatabase({
      url: config.url,
      schema: {},
      engine: "turso",
    });
    try {
      await turso.client.execute(`
        CREATE TABLE entities (
          id TEXT NOT NULL,
          entityType TEXT NOT NULL,
          content TEXT NOT NULL,
          PRIMARY KEY (id, entityType)
        )
      `);
      await turso.client.execute(
        "CREATE INDEX entities_content_fts ON entities USING fts (content)",
      );
      await turso.client.execute(`
        INSERT INTO entities (id, entityType, content)
        VALUES ('typescript', 'note', 'TypeScript is a typed superset of JavaScript')
      `);
      await turso.client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      turso.client.close();
    }

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
