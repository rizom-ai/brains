import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { closeSqliteClient, runPackageMigrations } from "@brains/db";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEntityDatabase } from "../src/db";
import { migrateEntities } from "../src/migrate";
import { ProjectionStore } from "../src/projection-store";

const migrationNames = [
  "0000_lucky_yellowjacket.sql",
  "0001_sleepy_mandroid.sql",
  "0002_rename_base_notes.sql",
  "0003_typical_earthquake.sql",
] as const;

describe("projection migrations", () => {
  let testDirectory: string | undefined;

  afterEach(async () => {
    if (testDirectory) {
      await rm(testDirectory, { recursive: true, force: true });
      testDirectory = undefined;
    }
  });

  it("backfills existing entities exactly once during scheduler cutover", async () => {
    testDirectory = await mkdtemp(join(tmpdir(), "projection-migration-"));
    const legacyMigrations = join(testDirectory, "legacy-migrations");
    const legacyMeta = join(legacyMigrations, "meta");
    const databaseUrl = `file:${join(testDirectory, "entities.db")}`;
    const migrations = new URL("../drizzle/", import.meta.url);
    await mkdir(legacyMeta, { recursive: true });

    for (const migrationName of migrationNames) {
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
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 4) }),
    );

    await runPackageMigrations({
      label: "legacy-entity-test",
      config: { url: databaseUrl },
      engine: "libsql",
      schema: {},
      migrationsFolder: legacyMigrations,
    });

    const legacyClient = createClient({ url: databaseUrl });
    await legacyClient.execute({
      sql: `INSERT INTO entities
        (id, entityType, content, contentHash, visibility, metadata, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "document-1",
        "document",
        "Existing content",
        "content-hash",
        "public",
        "{}",
        10,
        20,
      ],
    });
    await closeSqliteClient(legacyClient);

    await migrateEntities({ url: databaseUrl });
    const repeatedMigration = Bun.spawn({
      cmd: [
        process.execPath,
        new URL("./fixtures/migrate-entities-process.ts", import.meta.url)
          .pathname,
        databaseUrl,
      ],
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([
      repeatedMigration.exited,
      new Response(repeatedMigration.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(stderr);

    const connection = createEntityDatabase({ url: databaseUrl });
    const store = new ProjectionStore(connection.db);

    expect(await store.listPendingInputs()).toEqual([
      expect.objectContaining({
        sourceType: "document",
        sourceId: "document-1",
        revision: "content-hash:20",
        operation: "upsert",
      }),
    ]);

    await closeSqliteClient(connection.client);
  });
});
