import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SqlWorkerDriver } from "../../../src/turso-worker/client";

export async function exerciseControlAdmission(
  driver: SqlWorkerDriver,
): Promise<void> {
  await driver.execute({
    sql: "CREATE TABLE proof_control_rows (id INTEGER PRIMARY KEY)",
  });
  await assert.rejects(
    driver.execute({ sql: "/* no raw transaction */ BEGIN" }),
    { name: "SqlAdmissionError" },
  );
  await assert.rejects(
    driver.executeMultiple(
      "INSERT INTO proof_control_rows VALUES (1); COMMIT; BEGIN",
    ),
    { name: "SqlAdmissionError" },
  );
  await assert.rejects(
    driver.batch([
      { sql: "INSERT INTO proof_control_rows VALUES (1)" },
      { sql: "COMMIT" },
    ]),
    { name: "SqlAdmissionError" },
  );
  await assert.rejects(
    driver.migrate([
      { sql: "INSERT INTO proof_control_rows VALUES (1)" },
      { sql: "SAVEPOINT surprise" },
    ]),
    { name: "SqlAdmissionError" },
  );
  assert.equal(
    (await driver.execute({ sql: "SELECT count(*) FROM proof_control_rows" }))
      .rows[0]?.[0],
    0,
  );
  assert.equal(
    (
      await driver.execute({
        sql: "SELECT CASE WHEN 1 THEN $commit ELSE 'ROLLBACK' END AS \"BEGIN\"",
        args: { commit: "COMMIT; BEGIN; 你好" },
      })
    ).rows[0]?.[0],
    "COMMIT; BEGIN; 你好",
  );

  const lease = await driver.transaction();
  try {
    await lease.execute({ sql: "INSERT INTO proof_control_rows VALUES (2)" });
    await assert.rejects(lease.execute({ sql: "COMMIT" }), {
      name: "SqlAdmissionError",
    });
    await assert.rejects(
      driver.executeMultiple(
        "INSERT INTO proof_control_rows VALUES (3); COMMIT; BEGIN",
        lease.id,
      ),
      { name: "SqlAdmissionError" },
    );
    const outer = await lease.savepoint();
    const inner = await lease.savepoint();
    await lease.execute({ sql: "INSERT INTO proof_control_rows VALUES (4)" });
    await assert.rejects(lease.finishSavepoint(outer, "release"), /non-leaf/);
    await assert.rejects(
      lease.finishSavepoint({ ...inner, generation: randomUUID() }, "release"),
      /Foreign/,
    );
    await lease.finishSavepoint(inner, "rollback");
    await assert.rejects(
      lease.finishSavepoint(inner, "release"),
      /spent|non-leaf/,
    );
    await lease.finishSavepoint(outer, "release");
    assert.deepEqual(
      (
        await lease.execute({
          sql: "SELECT id FROM proof_control_rows ORDER BY id",
        })
      ).rows.map((row) => row[0]),
      [2],
    );
  } finally {
    await lease.rollback();
  }
  assert.equal(
    (await driver.execute({ sql: "SELECT count(*) FROM proof_control_rows" }))
      .rows[0]?.[0],
    0,
  );
}
