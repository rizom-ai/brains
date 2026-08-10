import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteDatabase, runPackageMigrations } from "@brains/db";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateEntities } from "../src/migrate";

const legacyMigrationNames = [
  "0000_lucky_yellowjacket.sql",
  "0001_sleepy_mandroid.sql",
  "0002_rename_base_notes.sql",
  "0003_typical_earthquake.sql",
  "0004_entity_only_projection_inputs.sql",
  "0005_backfill_projection_inputs.sql",
] as const;

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createLegacyEntityDatabase(): Promise<{
  url: string;
  directory: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "embedding-migration-"));
  directories.push(directory);
  const legacyMigrations = join(directory, "legacy-migrations");
  const legacyMeta = join(legacyMigrations, "meta");
  const url = `file:${join(directory, "entities.db")}`;
  const migrations = new URL("../drizzle/", import.meta.url);
  await mkdir(legacyMeta, { recursive: true });

  for (const migrationName of legacyMigrationNames) {
    await writeFile(
      join(legacyMigrations, migrationName),
      await readFile(new URL(migrationName, migrations)),
    );
  }
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", migrations), "utf8"),
  ) as { entries: unknown[] };
  await writeFile(
    join(legacyMeta, "_journal.json"),
    JSON.stringify({
      ...journal,
      entries: journal.entries.slice(0, legacyMigrationNames.length),
    }),
  );

  await runPackageMigrations({
    label: "legacy-embedding-test",
    config: { url },
    schema: {},
    migrationsFolder: legacyMigrations,
  });
  return { url, directory };
}

async function seedLegacyRows(url: string): Promise<void> {
  const { client } = createSqliteDatabase({ url, schema: {} });
  await client.execute({
    sql: `INSERT INTO entities
      (id, entityType, content, contentHash, visibility, metadata, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "note-1",
      "note",
      "Existing content",
      "hash-1",
      "public",
      "{}",
      1,
      1,
    ],
  });
  await client.execute({
    sql: `INSERT INTO embeddings
      (entity_id, entity_type, embedding, content_hash)
      VALUES (?, ?, vector32(?), ?)`,
    args: ["note-1", "note", JSON.stringify([0.1, 0.2]), "hash-1"],
  });
  await client.execute({
    sql: `INSERT INTO embeddings
      (entity_id, entity_type, embedding, content_hash)
      VALUES (?, ?, vector32(?), ?)`,
    args: ["missing", "note", JSON.stringify([0.3, 0.4]), "orphan-hash"],
  });
  client.close();
}

describe("embedding consolidation migration", () => {
  test("preserves entities and clears unversioned vectors for regeneration", async () => {
    const legacy = await createLegacyEntityDatabase();
    await seedLegacyRows(legacy.url);

    await migrateEntities({ url: legacy.url });

    const { client } = createSqliteDatabase({ url: legacy.url, schema: {} });
    const entities = await client.execute("SELECT id FROM entities");
    const embeddings = await client.execute("SELECT * FROM embeddings");
    const foreignKeys = await client.execute(
      "PRAGMA foreign_key_list(embeddings)",
    );
    expect(entities.rows.map((row) => row["id"])).toEqual(["note-1"]);
    expect(embeddings.rows).toEqual([]);
    expect(foreignKeys.rows).toHaveLength(2);
    client.close();
  });

  test("leaves the old embedding table intact when the schema rebuild fails", async () => {
    const legacy = await createLegacyEntityDatabase();
    await seedLegacyRows(legacy.url);
    const before = createSqliteDatabase({ url: legacy.url, schema: {} });
    await before.client.execute("CREATE TABLE __new_embeddings (value TEXT)");
    before.client.close();

    expect(migrateEntities({ url: legacy.url })).rejects.toThrow();

    const after = createSqliteDatabase({ url: legacy.url, schema: {} });
    const rows = await after.client.execute("SELECT entity_id FROM embeddings");
    expect(rows.rows).toHaveLength(2);
    after.client.close();
  });
});
