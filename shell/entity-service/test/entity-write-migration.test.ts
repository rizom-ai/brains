import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { runPackageMigrations } from "@brains/db";
import { z } from "@brains/utils/zod";
import { migrateEntities } from "../src/migrate";

const journalSchema = z.looseObject({
  entries: z.array(z.looseObject({ idx: z.number(), tag: z.string() })),
});

test("write-receipt migration adds only the receipt table and leaves legacy entities untouched", async () => {
  const dir = await mkdtemp(join(tmpdir(), "entity-write-migration-"));
  const config = { url: `file:${join(dir, "entities.db")}` };
  const client = createClient(config);
  try {
    const migrations = new URL("../drizzle/", import.meta.url);
    const journal = journalSchema.parse(
      JSON.parse(
        await readFile(new URL("meta/_journal.json", migrations), "utf8"),
      ),
    );
    const legacy = join(dir, "legacy");
    await mkdir(join(legacy, "meta"), { recursive: true });
    const entries = journal.entries.filter((entry) => entry.idx < 11);
    for (const { tag } of entries)
      await writeFile(
        join(legacy, `${tag}.sql`),
        await readFile(new URL(`${tag}.sql`, migrations)),
      );
    await writeFile(
      join(legacy, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries }),
    );
    await runPackageMigrations({
      label: "legacy-entity-write-test",
      config,
      schema: {},
      migrationsFolder: legacy,
    });
    await client.execute({
      sql: "INSERT INTO entities (id, entityType, content, contentHash, metadata, visibility, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        "book:日本語:Café",
        "book-section",
        "Existing markdown",
        "original-hash",
        '{"clientId":"original"}',
        "restricted",
        10,
        20,
      ],
    });
    const before = await client.execute("SELECT * FROM entities");
    await migrateEntities(config);
    expect((await client.execute("SELECT * FROM entities")).rows).toEqual(
      before.rows,
    );
    expect(
      (await client.execute("SELECT * FROM entity_write_receipts")).rows,
    ).toEqual([]);
    // Revisions are derived from row content, so no trigger or version table
    // is installed and a later drizzle regeneration cannot silently drop one.
    const triggers = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'trigger'",
    );
    expect(triggers.rows).toEqual([]);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'entity_write_%'",
    );
    expect(tables.rows.map((row) => row["name"])).toEqual([
      "entity_write_receipts",
    ]);
    await migrateEntities(config);
    expect((await client.execute("SELECT * FROM entities")).rows).toEqual(
      before.rows,
    );
  } finally {
    client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
