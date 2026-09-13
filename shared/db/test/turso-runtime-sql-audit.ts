// Opt-in repository corpus audit; no runtime service imports or caller replacement.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/libsql/migrator";
import { SqlWorkerDriver } from "../src/turso-worker/client";
import { createWorkerDatabase } from "../src/turso-worker/binary-transaction";
import { assertOrdinarySql } from "../src/turso-worker/sql-admission";

const stores = [
  "entity-service",
  "auth-service",
  "job-queue",
  "conversation-service",
  "runtime-state",
];
const workerUrl = new URL("../src/turso-worker/worker.ts", import.meta.url);
async function withCleanup<T>(
  body: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  let result: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    result = { ok: true, value: await body() };
  } catch (error) {
    result = { ok: false, error };
  }
  try {
    await cleanup();
  } catch (error) {
    if (!result.ok)
      throw new AggregateError(
        [result.error, error],
        "SQL audit and cleanup failed",
        { cause: error },
      );
    throw error;
  }
  if (!result.ok) throw result.error;
  return result.value;
}
async function withDriver<T>(
  path: string,
  body: (driver: SqlWorkerDriver) => Promise<T>,
): Promise<T> {
  const driver = new SqlWorkerDriver({
    url: pathToFileURL(path).href,
    workerUrl,
  });
  return withCleanup(
    () => body(driver),
    () => driver.close(),
  );
}
async function state(
  driver: SqlWorkerDriver,
): Promise<{ schema: unknown[][]; journal: unknown[][] }> {
  assert.equal(
    (await driver.execute({ sql: "PRAGMA integrity_check" })).rows[0]?.[0],
    "ok",
  );
  assert.equal(
    (await driver.execute({ sql: "PRAGMA foreign_key_check" })).rows.length,
    0,
  );
  const schema = (
    await driver.execute({
      sql: "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name",
    })
  ).rows.map((row) => [row[0], row[1], row[2], row[3]]);
  const journal = (
    await driver.execute({
      sql: "SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at",
    })
  ).rows.map((row) => [row[0], row[1]]);
  return { schema, journal };
}

const root = await mkdtemp(join(tmpdir(), "brains-runtime-sql-audit-"));
await withCleanup(
  async () => {
    const reports = [];
    for (const store of stores) {
      const folder = join(root, store);
      await mkdir(folder);
      const migrationsFolder = join(folder, "migrations");
      await cp(
        fileURLToPath(
          new URL(`../../../shell/${store}/drizzle`, import.meta.url),
        ),
        migrationsFolder,
        { recursive: true },
      );
      const migrations = readMigrationFiles({ migrationsFolder });
      for (const migration of migrations)
        for (const sql of migration.sql) assertOrdinarySql(sql);
      const database = join(folder, "source.db");
      const expected = await withDriver(database, async (driver) => {
        const db = createWorkerDatabase(driver, {});
        await migrate(db, { migrationsFolder });
        const first = await state(driver);
        assert.deepEqual(
          first.journal,
          migrations.map((migration) => [
            migration.hash,
            migration.folderMillis,
          ]),
        );
        await migrate(db, { migrationsFolder });
        assert.deepEqual(await state(driver), first);
        assert.equal(
          (await driver.execute({ sql: "PRAGMA foreign_keys" })).rows[0]?.[0],
          1,
        );
        return first;
      });
      const restored = join(folder, "restored.db");
      await cp(database, restored, { errorOnExist: true, force: false });
      await withDriver(restored, async (driver) => {
        assert.deepEqual(await state(driver), expected);
      });
      reports.push({
        store,
        migrations: migrations.length,
        sqlStatements: migrations.reduce(
          (sum, migration) => sum + migration.sql.length,
          0,
        ),
        submittedStatements: migrations.reduce(
          (sum, migration) => sum + migration.sql.length + 1,
          0,
        ),
        corpusSha256: createHash("sha256")
          .update(
            JSON.stringify(
              migrations.map((migration) => ({
                hash: migration.hash,
                when: migration.folderMillis,
              })),
            ),
          )
          .digest("hex"),
        idempotent: true,
        mainFileRestore: true,
      });
    }
    console.log(
      JSON.stringify({
        scope: "repository-migration-sql-proof",
        stores: reports,
        runtimeReplaced: false,
        runtimeQueryCoverage: false,
        canonicalStartup: false,
      }),
    );
  },
  () => rm(root, { recursive: true, force: true }),
);
