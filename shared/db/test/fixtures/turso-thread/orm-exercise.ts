import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { migrate } from "drizzle-orm/libsql/migrator";
import { ProofLibsqlClient, createProofDatabase } from "./libsql-client";
import type { TursoThreadProof } from "./client";

const records = sqliteTable("orm_records", {
  id: integer("id").primaryKey(),
  label: text("label").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  at: integer("at", { mode: "timestamp_ms" }).notNull(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
});

export async function assertOrmRows(driver: TursoThreadProof): Promise<void> {
  const client = new ProofLibsqlClient(driver);
  assert.deepEqual(
    (await client.execute("SELECT id FROM orm_records ORDER BY id")).rows.map(
      (row) => row["id"],
    ),
    [1, 2, 3],
  );
  assert.equal(
    (await client.execute("SELECT count(*) AS count FROM orm_migrated"))
      .rows[0]?.["count"],
    1,
  );
}

export async function exerciseLibsqlSession(
  driver: TursoThreadProof,
  url: string,
): Promise<void> {
  const client = new ProofLibsqlClient(driver);
  const db = createProofDatabase(client, { records });
  await client.executeMultiple(
    "CREATE TABLE orm_records (id INTEGER PRIMARY KEY, label TEXT NOT NULL, enabled INTEGER NOT NULL, at INTEGER NOT NULL, bytes BLOB NOT NULL);",
  );
  const values = {
    label: "semi;colon",
    enabled: true,
    at: new Date(1234),
    bytes: Buffer.from([0, 128, 255]),
  };
  assert.deepEqual(
    await db
      .insert(records)
      .values({ id: 1, ...values })
      .returning({ id: records.id }),
    [{ id: 1 }],
  );
  const selected = await db
    .select()
    .from(records)
    .where(eq(records.id, sql.placeholder("id")))
    .prepare()
    .get({ id: 1 });
  assert.deepEqual(selected, { id: 1, ...values });
  assert.deepEqual(
    await db.query.records.findFirst({ where: eq(records.id, 1) }),
    selected,
  );
  const batched = await db.batch([
    db
      .insert(records)
      .values({ id: 2, ...values })
      .returning({ id: records.id }),
    db.select({ id: records.id }).from(records).orderBy(records.id),
  ]);
  assert.deepEqual(batched, [[{ id: 2 }], [{ id: 1 }, { id: 2 }]]);
  await assert.rejects(
    client.batch([
      [
        "INSERT INTO orm_records VALUES (?, ?, ?, ?, ?)",
        [4, "rolled back", false, new Date(0), new Uint8Array([1]).buffer],
      ],
      "INSERT INTO orm_records SELECT * FROM orm_records WHERE id = 1",
    ]),
  );
  await db.transaction(async (outer) => {
    await outer.insert(records).values({ id: 3, ...values });
    await assert.rejects(
      outer.transaction(async (inner) => {
        await inner.insert(records).values({ id: 4, ...values });
        throw new Error("nested ORM rollback");
      }),
      /nested ORM rollback/,
    );
  });

  const folder = join(dirname(fileURLToPath(url)), "orm-proof-migrations");
  await mkdir(join(folder, "meta"), { recursive: true });
  await writeFile(
    join(folder, "meta/_journal.json"),
    JSON.stringify({
      version: "6",
      dialect: "sqlite",
      entries: [
        {
          idx: 0,
          version: "6",
          when: 100,
          tag: "0000_proof",
          breakpoints: true,
        },
      ],
    }),
  );
  await writeFile(
    join(folder, "0000_proof.sql"),
    "CREATE TABLE orm_migrated (id INTEGER PRIMARY KEY);\n--> statement-breakpoint\nINSERT INTO orm_migrated VALUES (1);\n",
  );
  await migrate(db, { migrationsFolder: folder });
  await migrate(db, { migrationsFolder: folder });
  await assertOrmRows(driver);
}
