import assert from "node:assert/strict";
import { TursoThreadProof, type ProofTransaction } from "./client";

function ownerLost(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.equal(error.name, "PersistenceOwnerLostError");
  assert.match(error.message, /may have committed/);
  return true;
}

/** Actual deferred-FK commit rejection, not a synthetic SQL marker or timer. */
export async function exerciseFailedFinalization(
  url: string,
  workerUrl: URL,
): Promise<void> {
  const driver = new TursoThreadProof({ url, workerUrl });
  let lease: ProofTransaction | undefined;
  let faultAttempted = false;
  try {
    const placement = await driver.initialize();
    await driver.executeMultiple(
      "PRAGMA foreign_keys = ON; CREATE TABLE failure_parents (id INTEGER PRIMARY KEY); CREATE TABLE failure_children (id INTEGER PRIMARY KEY, parent INTEGER REFERENCES failure_parents(id) DEFERRABLE INITIALLY DEFERRED, bytes BLOB NOT NULL); INSERT INTO failure_parents VALUES (1);",
    );
    const scope = await driver.openBinaryScope();
    const capability = await scope.begin({ reservationBytes: 3 });
    await scope.append(capability, 0, new Uint8Array([0, 128, 255]));
    await scope.seal(capability);
    const claim = await scope.reserve(capability);
    await scope.close();
    lease = await driver.transaction("write", [claim]);
    await lease.executeBound({
      sql: "INSERT INTO failure_children VALUES (2, 99, ?)",
      args: [{ kind: "resident", claim }],
    });
    // Queue these BEFORE finalization, including durable close. None may enter
    // the native adapter once commit rejection makes reuse uncertain.
    const rejected = [
      assert.rejects(
        driver.execute({ sql: "INSERT INTO failure_parents VALUES (99)" }),
        ownerLost,
      ),
      assert.rejects(
        driver.migrate([{ sql: "INSERT INTO failure_parents VALUES (77)" }]),
        ownerLost,
      ),
      assert.rejects(driver.transaction(), ownerLost),
      assert.rejects(driver.close(), ownerLost),
    ];
    faultAttempted = true;
    rejected.push(assert.rejects(lease.commit(), ownerLost));
    await Promise.all(rejected); // close joins the terminated worker, not just its error reply.
    await assert.rejects(driver.initialize(), ownerLost);
    await assert.rejects(driver.execute({ sql: "SELECT 1" }), ownerLost);
    await assert.rejects(driver.stageStats(), ownerLost);

    // Explicit fresh-owner recovery in the fixture, never driver replay/respawn.
    const reopened = new TursoThreadProof({ url, workerUrl });
    try {
      assert.notEqual(
        (await reopened.initialize()).generation,
        placement.generation,
      );
      assert.deepEqual(
        (
          await reopened.execute({
            sql: "SELECT id FROM failure_parents ORDER BY id",
          })
        ).rows.map((row) => row[0]),
        [1],
      );
      assert.equal(
        (
          await reopened.execute({
            sql: "SELECT count(*) FROM failure_children",
          })
        ).rows[0]?.[0],
        0,
      );
      assert.deepEqual(await reopened.stageStats(), {
        reservedBytes: 0,
        stages: 0,
        scopes: 0,
        claims: 0,
        attached: 0,
      });
      await assert.rejects(
        reopened.transaction("write", [claim]),
        /Foreign binary capability/,
      );
    } finally {
      await reopened.close();
    }
  } finally {
    if (faultAttempted) await assert.rejects(driver.close(), ownerLost);
    else {
      try {
        await lease?.rollback();
      } finally {
        await driver.close();
      }
    }
  }
}
