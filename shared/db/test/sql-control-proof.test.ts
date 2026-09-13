import { afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  assertOrdinarySql,
  SqlAdmissionError,
} from "../src/turso-worker/sql-admission";
import { TursoThreadProof } from "./fixtures/turso-thread/client";
import { createProofDatabase } from "./fixtures/turso-thread/binary-transaction";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

const workerUrl = new URL("./fixtures/turso-thread/worker.ts", import.meta.url);
const drivers: TursoThreadProof[] = [];
async function setup(maxInFlight?: number): Promise<TursoThreadProof> {
  const driver = new TursoThreadProof({
    url: "file::memory:",
    workerUrl,
    ...(maxInFlight !== undefined && { maxInFlight }),
  });
  drivers.push(driver);
  await driver.execute({
    sql: "CREATE TABLE records (id INTEGER PRIMARY KEY)",
  });
  return driver;
}
afterEach(async () => {
  await Promise.all(drivers.splice(0).map((driver) => driver.close()));
});
const records = sqliteTable("records", { id: integer("id").primaryKey() });

describe("control SQL admission and typed savepoints", () => {
  it("keeps quoted data, comments, parameters, CASE and conflict rollback distinct from controls", () => {
    for (const sql of [
      "SELECT 'COMMIT; BEGIN; ''ROLLBACK''', \"SAVEPOINT\", `RELEASE`, [END]",
      "SELECT '你好 é Δ', \"é\" FROM records -- COMMIT; BEGIN\n",
      "/* COMMIT; BEGIN */ SELECT $commit, :rollback, @begin, ?1",
      "SELECT CASE WHEN 1 THEN CASE WHEN 0 THEN 2 ELSE 3 END ELSE 4 END; SELECT 2",
      "INSERT OR /* abort entire transaction on conflict */ ROLLBACK INTO records VALUES (1)",
      "CREATE TABLE other (id INTEGER UNIQUE ON CONFLICT ROLLBACK)",
    ])
      assert.doesNotThrow(() => assertOrdinarySql(sql));
  });

  it("rejects controls throughout the whole input and unsupported lexical forms without guessing boundaries", () => {
    const controls = [
      "BEGIN",
      "BEGIN IMMEDIATE",
      "COMMIT",
      "END TRANSACTION",
      "ROLLBACK",
      "ROLLBACK TO x",
      "SAVEPOINT x",
      "RELEASE SAVEPOINT x",
    ];
    for (const control of controls)
      for (const prefix of [
        "",
        "-- ignored\n",
        "/* ignored */",
        "INSERT INTO records VALUES (2); /* gap */",
      ]) {
        assert.throws(
          () => assertOrdinarySql(prefix + control.toLowerCase()),
          SqlAdmissionError,
        );
      }
    for (const sql of [
      "SELECT 'unterminated",
      'SELECT "unterminated',
      "SELECT [unterminated",
      "SELECT `unterminated",
      "/* unterminated",
      "SELECT 1\0; COMMIT",
      "COMMIT\u0085",
      "COMMIT\u00a0",
      "SELECT 1; -- ambiguous\u2028COMMIT",
      "SELECT $x(foo;COMMIT;bar)",
      "SELECT $x::name",
      "SELECT unquoted_é",
      "CREATE TRIGGER t AFTER INSERT ON records BEGIN SELECT 1; END;",
    ])
      assert.throws(() => assertOrdinarySql(sql), SqlAdmissionError);
  });

  it("preflights execute, scripts, batches and migrations before any native prefix can mutate storage", async () => {
    const driver = await setup();
    await assert.rejects(driver.execute({ sql: "BEGIN" }), {
      name: "SqlAdmissionError",
    });
    await assert.rejects(
      driver.executeMultiple(
        "INSERT INTO records VALUES (2); COMMIT; BEGIN; INSERT INTO records VALUES (3)",
      ),
      { name: "SqlAdmissionError" },
    );
    await assert.rejects(
      driver.batch([
        { sql: "INSERT INTO records VALUES (2)" },
        { sql: "COMMIT" },
      ]),
      { name: "SqlAdmissionError" },
    );
    await assert.rejects(
      driver.migrate([
        { sql: "INSERT INTO records VALUES (2)" },
        { sql: "SAVEPOINT surprise" },
      ]),
      { name: "SqlAdmissionError" },
    );
    expect(
      (await driver.execute({ sql: "SELECT count(*) FROM records" }))
        .rows[0]?.[0],
    ).toBe(0);
    expect(
      (
        await driver.execute({
          sql: "SELECT CASE WHEN 1 THEN 'COMMIT; 你好' ELSE '' END",
        })
      ).rows[0]?.[0],
    ).toBe("COMMIT; 你好");
  });

  it("checks ambiguous soft-keyword sequences against the native parser without accepting a transaction boundary", async () => {
    const driver = await setup();
    const lease = await driver.transaction();
    try {
      for (const sql of [
        "SELECT 1 AS CASE END",
        "SELECT 1 AS CONFLICT ROLLBACK",
        "CREATE TABLE CASE (id INTEGER) END",
      ]) {
        assert.doesNotThrow(() => assertOrdinarySql(sql));
        await assert.rejects(
          driver.executeMultiple(sql, lease.id),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.notEqual(error.name, "PersistenceOwnerLostError");
            assert.notEqual(error.name, "SqlAdmissionError");
            return true;
          },
        );
      }
      expect((await lease.execute({ sql: "SELECT 42" })).rows[0]?.[0]).toBe(42);
    } finally {
      await lease.rollback();
    }
  });

  it("rejects raw controls on every leased path without committing admitted writes", async () => {
    const driver = await setup();
    const lease = await driver.transaction();
    try {
      await lease.execute({ sql: "INSERT INTO records VALUES (1)" });
      await assert.rejects(lease.execute({ sql: "COMMIT" }), {
        name: "SqlAdmissionError",
      });
      await assert.rejects(lease.executeBound({ sql: "COMMIT", args: [] }), {
        name: "SqlAdmissionError",
      });
      await assert.rejects(
        driver.executeMultiple(
          "INSERT INTO records VALUES (2); COMMIT; BEGIN",
          lease.id,
        ),
        { name: "SqlAdmissionError" },
      );
      await assert.rejects(
        driver.batch(
          [{ sql: "INSERT INTO records VALUES (2)" }, { sql: "ROLLBACK" }],
          "write",
          lease.id,
        ),
        { name: "SqlAdmissionError" },
      );
      expect(
        (await lease.execute({ sql: "SELECT count(*) FROM records" }))
          .rows[0]?.[0],
      ).toBe(1);
    } finally {
      await lease.rollback();
    }
    expect(
      (await driver.execute({ sql: "SELECT count(*) FROM records" }))
        .rows[0]?.[0],
    ).toBe(0);
  });

  it("enforces leaf ownership, spent tokens, generation and lease affinity without consuming rightful tokens", async () => {
    const driver = await setup();
    const lease = await driver.transaction();
    const outer = await lease.savepoint();
    await lease.execute({ sql: "INSERT INTO records VALUES (1)" });
    const inner = await lease.savepoint();
    await lease.execute({ sql: "INSERT INTO records VALUES (2)" });
    try {
      await assert.rejects(lease.finishSavepoint(outer, "release"), /non-leaf/);
      await assert.rejects(
        lease.finishSavepoint(
          { ...inner, generation: randomUUID() },
          "release",
        ),
        /Foreign/,
      );
      await assert.rejects(
        lease.finishSavepoint({ ...inner, lease: randomUUID() }, "release"),
        /Foreign/,
      );
      await lease.finishSavepoint(inner, "rollback");
      await assert.rejects(
        lease.finishSavepoint(inner, "release"),
        /spent|non-leaf/,
      );
      await lease.finishSavepoint(outer, "release");
      await lease.commit();
    } finally {
      await lease.rollback();
    }
    const next = await driver.transaction();
    try {
      await assert.rejects(next.finishSavepoint(outer, "release"), /Foreign/);
    } finally {
      await next.rollback();
    }
    expect(
      (await driver.execute({ sql: "SELECT id FROM records" })).rows.map(
        (row) => row[0],
      ),
    ).toEqual([1]);
  });

  it("bounds savepoint depth and rolls back rather than committing an unfinished stack", async () => {
    const driver = await setup();
    const lease = await driver.transaction();
    for (let i = 0; i < 16; i++) await lease.savepoint();
    await assert.rejects(lease.savepoint(), /depth limit/);
    await lease.execute({ sql: "INSERT INTO records VALUES (1)" });
    await assert.rejects(
      lease.commit(),
      /open savepoints; transaction rolled back/,
    );
    expect(
      (await driver.execute({ sql: "SELECT count(*) FROM records" }))
        .rows[0]?.[0],
    ).toBe(0);
  });

  it("uses reserved control capacity to settle a savepoint during saturated shutdown", async () => {
    const driver = await setup(1);
    const lease = await driver.transaction();
    const queued = driver.execute({ sql: "SELECT 42" });
    const token = await lease.savepoint();
    const closing = driver.close();
    await lease.finishSavepoint(token, "rollback");
    await lease.rollback();
    expect((await queued).rows[0]?.[0]).toBe(42);
    await closing;
  });

  it("routes ordinary root ORM transactions through the guarded typed factory too", async () => {
    const driver = await setup();
    const db = createProofDatabase(driver, { records });
    await db.transaction(
      async (outer) => {
        const stale = await outer.transaction(async (inner) => {
          await inner.insert(records).values({ id: 1 });
          return inner;
        });
        await assert.rejects(
          async () => stale.select().from(records),
          /Failed query|closed/i,
        );
        await outer.insert(records).values({ id: 2 });
      },
      { behavior: "immediate" },
    );
    await assert.rejects(
      db.transaction(async () => undefined, { behavior: "exclusive" }),
      /not supported/,
    );
    expect(await db.select().from(records).orderBy(records.id)).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });
});
