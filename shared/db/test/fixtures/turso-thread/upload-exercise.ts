import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import type { SqlWorkerDriver } from "../../../src/turso-worker/client";

const SIZE = 65539;
const SHA256 =
  "82abcd7b965a2c75bef1461e9f5206f47621c1bdeda0aa75de8714ba73dabccc";

export async function exerciseDirectUpload(
  driver: SqlWorkerDriver,
  producerUrl: URL,
): Promise<void> {
  const placement = await driver.initialize();
  await driver.execute({
    sql: "CREATE TABLE proof_uploads (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL)",
  });
  const scope = await driver.openBinaryScope();
  try {
    const stage = await scope.begin({
      reservationBytes: SIZE,
      expectedSize: SIZE,
      expectedDigest: SHA256,
    });
    const facts = await driver.upload(stage, () => {
      const producer = new Worker(producerUrl, { workerData: { size: SIZE } });
      assert(producer.threadId > 0 && producer.threadId !== placement.threadId);
      producer.on("message", () =>
        assert.fail("Unexpected producer data on parent control channel"),
      );
      return producer;
    });
    assert.deepEqual(facts, {
      capability: stage,
      sizeBytes: SIZE,
      sha256: SHA256,
    });
    await assert.rejects(
      driver.upload(
        stage,
        () => new Worker(producerUrl, { workerData: { size: SIZE } }),
      ),
      /not available/,
    );
    // Failed grant replay must not destroy the already sealed stage.
    const claim = await scope.reserve(stage);
    const tx = await driver.transaction("write", [claim]);
    try {
      await scope.close(); // The admitted mutation retains its resident backing.
      await tx.executeBound({
        sql: "INSERT INTO proof_uploads VALUES (1, ?)",
        args: [{ kind: "resident", claim }],
      });
    } catch (error) {
      try {
        await tx.rollback();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Direct upload mutation and rollback failed",
          { cause: cleanup },
        );
      }
      throw error;
    }
    await tx.commit();
    await assertDirectUploadRows(driver);
  } finally {
    await scope.close();
  }
}
export async function assertDirectUploadRows(
  driver: SqlWorkerDriver,
): Promise<void> {
  assert.deepEqual(
    await driver.verifyBlob({
      table: "proof_uploads",
      column: "bytes",
      key: [{ column: "id", value: 1 }],
      maxBytes: SIZE,
    }),
    { sizeBytes: SIZE, sha256: SHA256 },
  );
}
