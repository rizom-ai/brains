import assert from "node:assert/strict";
import type { SqlWorkerDriver } from "../../../src/turso-worker/client";
import { SqlWorkerClient } from "../../../src/turso-worker/sql-client";
import type { SqlStatement } from "../../../src/turso-worker/protocol";

export async function assertMigrationRows(
  driver: SqlWorkerDriver,
): Promise<void> {
  assert.equal(
    (await driver.execute({ sql: "SELECT count(*) FROM proof_migration_rows" }))
      .rows[0]?.[0],
    50,
  );
  assert.equal(
    (
      await driver.execute({
        sql: "SELECT count(*) FROM proof_migration_rows WHERE id <= 48 AND hex(bytes) = '0080FF' AND label = '迁移'",
      })
    ).rows[0]?.[0],
    48,
  );
}

// Shared source/packed corpus: >64 KiB and >16 statements, still one native
// migration transaction. The sole large caller allocation is a borrowed-view
// lifetime probe; only three visible bytes per statement enter the snapshot.
export async function exerciseMigrationProgram(
  driver: SqlWorkerDriver,
): Promise<void> {
  const client = new SqlWorkerClient(driver);
  const backing = new Uint8Array(1024 * 1024);
  const view = backing.subarray(4096, 4099);
  view.set([0, 128, 255]);
  const statements: SqlStatement[] = [
    {
      sql: "CREATE TABLE proof_migration_rows (id INTEGER PRIMARY KEY, bytes BLOB, label TEXT)",
    },
  ];
  for (let id = 1; id <= 48; id++)
    statements.push({
      sql: `INSERT INTO proof_migration_rows VALUES (?, ?, ?) /* ${"x".repeat(4096)} */`,
      args: [id, view, "迁移"],
    });
  const pending = driver.migrateProgram(statements);
  view.fill(1);
  const original = statements[1];
  if (original) original.sql = "COMMIT";
  const results = await pending;
  assert.equal(results.length, 49);
  assert.equal(
    results.slice(1).every((result) => result.rowsAffected === 1),
    true,
  );
  assert.equal(backing.byteLength, 1024 * 1024);
  assert.deepEqual([...view], [1, 1, 1]);

  const prefix = Array.from(
    { length: 33 },
    (_, i) => `INSERT INTO proof_migration_rows(id) VALUES (${100 + i})`,
  );
  await assert.rejects(
    client.migrate([
      ...prefix,
      "INSERT INTO proof_migration_rows(id) VALUES (1)",
    ]),
  );
  assert.equal(
    (
      await driver.execute({
        sql: "SELECT count(*) FROM proof_migration_rows WHERE id >= 100",
      })
    ).rows[0]?.[0],
    0,
  );
  await assert.rejects(
    client.migrate([
      "CREATE TABLE forbidden_migration_prefix (id INTEGER)",
      ...prefix,
      "COMMIT; BEGIN",
    ]),
    { name: "SqlAdmissionError" },
  );
  assert.equal(
    (
      await driver.execute({
        sql: "SELECT count(*) FROM sqlite_master WHERE name = 'forbidden_migration_prefix'",
      })
    ).rows[0]?.[0],
    0,
  );
  await client.migrate(["INSERT INTO proof_migration_rows(id) VALUES (49)"]);
  await assert.rejects(
    client.migrate([
      "INSERT INTO proof_migration_rows(id) VALUES (50)",
      "SELECT zeroblob(65536)",
    ]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal("code" in error && error.code, "RESULT_UNAVAILABLE");
      assert(error.cause instanceof Error);
      assert.match(error.cause.message, /result byte limit/);
      return true;
    },
  );
  assert.equal(
    (await driver.execute({ sql: "PRAGMA foreign_keys" })).rows[0]?.[0],
    1,
  );
  await assertMigrationRows(driver);
}
