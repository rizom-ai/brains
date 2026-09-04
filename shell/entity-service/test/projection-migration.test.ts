import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { closeSqliteClient, runPackageMigrations } from "@brains/db";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEntityDatabase } from "../src/db";
import { migrateEntities } from "../src/migrate";
import { z } from "@brains/utils/zod";

/** Drizzle's migration journal, as far as these tests rewrite it. */
const journalSchema = z.looseObject({ entries: z.array(z.unknown()) });
import { ProjectionStore } from "../src/projection-store";

const migrationNames = [
  "0000_lucky_yellowjacket.sql",
  "0001_sleepy_mandroid.sql",
  "0002_rename_base_notes.sql",
  "0003_typical_earthquake.sql",
] as const;

const ownershipMigrationNames = [
  ...migrationNames,
  "0004_entity_only_projection_inputs.sql",
  "0005_backfill_projection_inputs.sql",
  "0006_slimy_changeling.sql",
  "0007_brief_quasar.sql",
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
    const journal = journalSchema.parse(
      JSON.parse(
        await readFile(new URL("meta/_journal.json", migrations), "utf8"),
      ),
    );
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

  it("backfills current projection outputs without reclaiming later ordinary writes", async () => {
    testDirectory = await mkdtemp(
      join(tmpdir(), "projection-ownership-migration-"),
    );
    const legacyMigrations = join(testDirectory, "legacy-migrations");
    const legacyMeta = join(legacyMigrations, "meta");
    const databaseUrl = `file:${join(testDirectory, "entities.db")}`;
    const migrations = new URL("../drizzle/", import.meta.url);
    await mkdir(legacyMeta, { recursive: true });

    for (const migrationName of ownershipMigrationNames) {
      await writeFile(
        join(legacyMigrations, migrationName),
        await readFile(new URL(migrationName, migrations)),
      );
    }
    const journal = journalSchema.parse(
      JSON.parse(
        await readFile(new URL("meta/_journal.json", migrations), "utf8"),
      ),
    );
    await writeFile(
      join(legacyMeta, "_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 8) }),
    );

    await runPackageMigrations({
      label: "legacy-projection-ownership-test",
      config: { url: databaseUrl },
      schema: {},
      migrationsFolder: legacyMigrations,
    });

    const legacyClient = createClient({ url: databaseUrl });
    for (const [id, updated] of [
      ["derived-skill", 90],
      ["pending-ordinary-skill", 95],
      ["ordinary-skill", 110],
    ] as const) {
      await legacyClient.execute({
        sql: `INSERT INTO entities
          (id, entityType, content, contentHash, visibility, metadata, created, updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          "skill",
          `Content for ${id}`,
          `hash-${id}`,
          "public",
          "{}",
          10,
          updated,
        ],
      });
    }
    await legacyClient.execute({
      sql: `INSERT INTO projection_dirty_inputs
        (source_type, source_id, revision, operation, marked_at)
        VALUES (?, ?, ?, ?, ?)`,
      args: [
        "skill",
        "pending-ordinary-skill",
        "ordinary-revision",
        "upsert",
        96,
      ],
    });
    await legacyClient.execute({
      sql: `INSERT INTO projection_waves
        (id, cutoff_generation, graph_fingerprint, admission_epoch, status, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ["wave-latest", 1, "graph-1", 0, "completed", 80, 100],
    });
    await legacyClient.execute({
      sql: `INSERT INTO projection_wave_rules
        (wave_id, rule_id, target_type, level, status, input_fingerprint)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "wave-latest",
        "skill-derivation",
        "skill",
        0,
        "completed",
        "skill-input",
      ],
    });
    await legacyClient.execute({
      sql: `INSERT INTO projection_rule_memos
        (rule_id, rule_version, input_fingerprint, write_intents, created_at)
        VALUES (?, ?, ?, ?, ?)`,
      args: [
        "skill-derivation",
        "1",
        "skill-input",
        JSON.stringify([
          {
            operation: "upsert",
            entity: {
              id: "derived-skill",
              entityType: "skill",
              content: "Derived",
              metadata: {},
              visibility: "public",
            },
          },
          {
            operation: "upsert",
            entity: {
              id: "pending-ordinary-skill",
              entityType: "skill",
              content: "Pending ordinary",
              metadata: {},
              visibility: "public",
            },
          },
          {
            operation: "upsert",
            entity: {
              id: "ordinary-skill",
              entityType: "skill",
              content: "Ordinary",
              metadata: {},
              visibility: "public",
            },
          },
        ]),
        30,
      ],
    });
    legacyClient.close();

    await migrateEntities({ url: databaseUrl });
    await migrateEntities({ url: databaseUrl });
    const connection = createEntityDatabase({ url: databaseUrl });
    const store = new ProjectionStore(connection.db);

    expect(
      await store.isProjectionOwnedEntity({
        entityType: "skill",
        id: "derived-skill",
      }),
    ).toBe(true);
    expect(
      await store.isProjectionOwnedEntity({
        entityType: "skill",
        id: "pending-ordinary-skill",
      }),
    ).toBe(false);
    expect(
      await store.isProjectionOwnedEntity({
        entityType: "skill",
        id: "ordinary-skill",
      }),
    ).toBe(false);

    connection.client.close();
  });
});
