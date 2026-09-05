import { afterEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { closeSqliteClient, createSqliteDatabase } from "@brains/db";
import { createSilentLogger } from "@brains/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateEntities } from "../src/migrate";

describe("Turso entity database startup", () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  test("refuses released FTS5 schema without modifying its durable contents", async () => {
    const directory = await mkdtemp(join(tmpdir(), "brains-turso-legacy-"));
    directories.push(directory);
    const url = `file:${join(directory, "entities.db")}`;
    // libSQL is a fixture producer only, never a runtime fallback.
    const legacy = createClient({ url });
    try {
      await legacy.executeMultiple(`
        CREATE TABLE entities (id TEXT PRIMARY KEY, content TEXT NOT NULL);
        INSERT INTO entities VALUES ('existing-note', 'Existing production content');
        CREATE VIRTUAL TABLE entity_fts USING fts5(entity_id UNINDEXED, content);
        INSERT INTO entity_fts VALUES ('existing-note', 'Existing production content');
      `);
    } finally {
      await closeSqliteClient(legacy);
    }

    const failure = await migrateEntities({ url }, createSilentLogger()).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error))
      throw new Error("Expected legacy-schema rejection");
    expect(failure.message).toContain(
      "Import the 0.2 backup into a new 0.3 data directory",
    );

    const reader = createClient({ url });
    try {
      const entity = await reader.execute(
        "SELECT content FROM entities WHERE id = 'existing-note'",
      );
      expect(entity.rows[0]?.["content"]).toBe("Existing production content");
      const matches = await reader.execute(
        "SELECT entity_id FROM entity_fts WHERE entity_fts MATCH 'production'",
      );
      expect(matches.rows[0]?.["entity_id"]).toBe("existing-note");
      const migrations = await reader.execute(
        "SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'",
      );
      expect(migrations.rows).toEqual([]);
    } finally {
      await closeSqliteClient(reader);
    }
  });

  test("creates and reopens the Turso schema without a libSQL cleanup pass", async () => {
    const directory = await mkdtemp(join(tmpdir(), "brains-turso-fresh-"));
    directories.push(directory);
    const config = { url: `file:${join(directory, "entities.db")}` };
    const logger = createSilentLogger();
    await migrateEntities(config, logger);
    await migrateEntities(config, logger);
    const { client } = createSqliteDatabase({ url: config.url, schema: {} });
    try {
      const searchSchema = await client.execute(
        "SELECT name FROM sqlite_master WHERE name = 'entity_fts'",
      );
      expect(searchSchema.rows).toEqual([]);
      const columns = await client.execute("PRAGMA table_info(entities)");
      expect(columns.rows.map((row) => row["name"])).toContain("search_text");
    } finally {
      await closeSqliteClient(client);
    }
  });
});
