import assert from "node:assert/strict";
import { TursoThreadProof, type ProofTransaction } from "./client";

/** Native implicit rollback must fence statements already admitted on that lease. */
export async function exerciseNativeState(
  baseUrl: string,
  workerUrl: URL,
): Promise<void> {
  const url = new URL("native-state-implicit-rollback.db", baseUrl).href;
  const driver = new TursoThreadProof({ url, workerUrl });
  let lease: ProofTransaction | undefined;
  let closed: Promise<void> | undefined;
  try {
    const original = await driver.initialize();
    await driver.executeMultiple(
      "CREATE TABLE native_state_rows (id INTEGER PRIMARY KEY, bytes BLOB); INSERT INTO native_state_rows VALUES (1, X'01');",
    );
    const scope = await driver.openBinaryScope();
    const capability = await scope.begin({ reservationBytes: 3 });
    await scope.append(capability, 0, new Uint8Array([0, 128, 255]));
    await scope.seal(capability);
    const claim = await scope.reserve(capability);
    await scope.close();
    lease = await driver.transaction("write", [claim]);
    await lease.executeBound({
      sql: "INSERT INTO native_state_rows VALUES (2, ?)",
      args: [{ kind: "resident", claim }],
    });
    const failures = [
      assert.rejects(
        lease.execute({
          sql: "INSERT OR ROLLBACK INTO native_state_rows VALUES (1, X'FF')",
        }),
        (error) => {
          assert(error instanceof Error);
          assert.equal(error.name, "PersistenceOwnerLostError");
          const owner = error.cause;
          assert(owner instanceof Error);
          assert.equal(owner.name, "OwnerUncertainError");
          const resource = owner.cause;
          assert(resource instanceof Error);
          assert.equal(resource.name, "NativeStatementUncertainError");
          const combined = resource.cause;
          assert(combined instanceof AggregateError);
          const [primary, state]: unknown[] = combined.errors;
          assert(primary instanceof Error && state instanceof Error);
          assert.match(primary.message, /UNIQUE constraint failed/);
          assert.match(state.message, /Native transaction state changed/);
          assert.equal(combined.cause, state);
          return true;
        },
      ),
      assert.rejects(
        lease.execute({
          sql: "INSERT INTO native_state_rows VALUES (3, X'03')",
        }),
        { name: "PersistenceOwnerLostError" },
      ),
      assert.rejects(
        driver.execute({
          sql: "INSERT INTO native_state_rows VALUES (99, X'99')",
        }),
        { name: "PersistenceOwnerLostError" },
      ),
    ];
    closed = assert.rejects(driver.close(), {
      name: "PersistenceOwnerLostError",
    });
    await Promise.all([...failures, closed]);
    assert.equal(lease.closed, true);
    await assert.rejects(driver.initialize(), {
      name: "PersistenceOwnerLostError",
    });
    const reopened = new TursoThreadProof({ url, workerUrl });
    try {
      assert.notEqual(
        (await reopened.initialize()).generation,
        original.generation,
      );
      assert.deepEqual(
        (
          await reopened.execute({
            sql: "SELECT id FROM native_state_rows ORDER BY id",
          })
        ).rows.map((row) => row[0]),
        [1],
      );
      assert.equal((await reopened.stageStats()).reservedBytes, 0);
    } finally {
      await reopened.close();
    }
  } finally {
    if (closed) await closed;
    else {
      try {
        await lease?.rollback();
      } finally {
        await driver.close();
      }
    }
  }
}
