import { expect, test } from "bun:test";
import { cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createTestDirectory } from "@brains/test-utils";
import journal from "../drizzle/meta/_journal.json";

const migrationsFolder = join(import.meta.dir, "../drizzle");
const receiptIndex = journal.entries.findIndex(
  ({ tag }) => tag === "0011_entity_mutation_receipts",
);

// The accepted SDK branch already had this index before main gained receipts.
// Its SQL remains in the migration directory; its older journal timestamp
// must not cause an existing native database to skip the forward index repair.
const sdkIndexEntry = {
  idx: 11,
  version: "6",
  when: 1788107060935,
  tag: "0011_unknown_thunderball",
  breakpoints: true,
};

test.each(["fresh", "native", "sdk"] as const)(
  "entity migrations upgrade %s history without losing content or receipts",
  async (origin) => {
    expect(receiptIndex).toBe(11);
    const directory = await createTestDirectory(`entity-migration-${origin}`);
    const client = createClient({ url: `file:${directory.dir}/entities.db` });
    try {
      const db = drizzle(client);
      if (origin !== "fresh") {
        const previous = join(directory.dir, "previous");
        await cp(migrationsFolder, previous, { recursive: true });
        const entries =
          origin === "native"
            ? journal.entries.slice(0, receiptIndex + 1)
            : [...journal.entries.slice(0, receiptIndex), sdkIndexEntry];
        await writeFile(
          join(previous, "meta/_journal.json"),
          JSON.stringify({ ...journal, entries }),
        );
        await migrate(db, { migrationsFolder: previous });
        await client.execute({
          sql: "INSERT INTO entities (id, entityType, content, contentHash, visibility, metadata, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          args: [
            "existing",
            "summary",
            "Original content",
            "original-hash",
            "restricted",
            '{"sourceSummaryId":"source"}',
            1,
            1,
          ],
        });
        if (origin === "native") {
          await client.execute({
            sql: "INSERT INTO entity_mutation_receipts (namespace, key, result, recorded_at) VALUES (?, ?, ?, ?)",
            args: ["faq.capture", "reply", '{"operation":"none"}', 1],
          });
        }
      }

      await migrate(db, { migrationsFolder });
      // Restart/retry must be safe on every upgrade path.
      await migrate(db, { migrationsFolder });
      const objects = await client.execute(
        "SELECT name FROM sqlite_master WHERE name IN ('entity_mutation_receipts', 'entities_type_visibility_source_summary_idx') ORDER BY name",
      );
      expect(objects.rows.map((row) => row["name"])).toEqual([
        "entities_type_visibility_source_summary_idx",
        "entity_mutation_receipts",
      ]);
      const rows = await client.execute(
        "SELECT content, metadata, visibility FROM entities WHERE id = 'existing'",
      );
      expect(
        rows.rows.map((row) => ({
          content: row["content"],
          metadata: row["metadata"],
          visibility: row["visibility"],
        })),
      ).toEqual(
        origin === "fresh"
          ? []
          : [
              {
                content: "Original content",
                metadata: '{"sourceSummaryId":"source"}',
                visibility: "restricted",
              },
            ],
      );
      const receipts = await client.execute(
        "SELECT namespace, key, result FROM entity_mutation_receipts",
      );
      expect(
        receipts.rows.map((row) => ({
          namespace: row["namespace"],
          key: row["key"],
          result: row["result"],
        })),
      ).toEqual(
        origin === "native"
          ? [
              {
                namespace: "faq.capture",
                key: "reply",
                result: '{"operation":"none"}',
              },
            ]
          : [],
      );
      const plan = await client.execute(
        "EXPLAIN QUERY PLAN SELECT id FROM entities WHERE entityType = 'summary' AND visibility = 'restricted' AND json_extract(metadata, '$.sourceSummaryId') = 'source'",
      );
      expect(JSON.stringify(plan.rows)).toContain(
        "entities_type_visibility_source_summary_idx",
      );
    } finally {
      client.close();
      await directory.cleanup();
    }
  },
);
