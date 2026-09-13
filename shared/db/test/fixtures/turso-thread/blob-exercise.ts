import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { blob, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { SqlWorkerDriver } from "../../../src/turso-worker/client";
import { withBinaryTransaction } from "../../../src/turso-worker/binary-transaction";
import { STAGE_BUDGET_BYTES } from "../../../src/turso-worker/binary-protocol";
import type { BlobPlan } from "../../../src/turso-worker/blob-protocol";

const zeroDigest =
  "d4f9bcbd9be765d114b85ab79d16c218fb5c1e03315f689603d48eed00bff97f";
const smallDigest =
  "709e80c88487a2411e1ee4dfb9f22a861492d20c4765150c0c794abd70f8147c";
const corruptDigest =
  "fb50dc0717ff266cf9baf82b1ce7a1c2ef6d9247859680b11a19fb7077f5f222";
const payloads = sqliteTable("proof_verify", {
  partition: text().notNull(),
  id: text().notNull(),
  bytes: blob({ mode: "buffer" }).notNull(),
});
const plan: BlobPlan = {
  table: "proof_verify",
  column: "bytes",
  key: [
    { column: "partition", value: "big" },
    { column: "id", value: "value" },
  ],
  maxBytes: 65539,
  expectedSize: 65539,
};
const smallPlan: BlobPlan = {
  ...plan,
  key: [
    { column: "partition", value: "small" },
    { column: "id", value: "value" },
  ],
  maxBytes: 3,
  expectedSize: 3,
};

const corruptPlan: BlobPlan = {
  ...smallPlan,
  key: [
    { column: "partition", value: "corrupt" },
    { column: "id", value: "value" },
  ],
};

export async function assertVerifiedBlobs(
  driver: SqlWorkerDriver,
): Promise<void> {
  assert.deepEqual(await driver.verifyBlob(plan), {
    sizeBytes: 65539,
    sha256: zeroDigest,
  });
  assert.deepEqual(await driver.verifyBlob(smallPlan), {
    sizeBytes: 3,
    sha256: smallDigest,
  });
  // Detection/rollback does not silently repair pre-existing corruption.
  assert.deepEqual(await driver.verifyBlob(corruptPlan), {
    sizeBytes: 3,
    sha256: corruptDigest,
  });
  assert.equal(
    (await driver.execute({ sql: "SELECT count(*) FROM proof_verify" }))
      .rows[0]?.[0],
    3,
  );
}
export async function exerciseBlobVerification(
  driver: SqlWorkerDriver,
): Promise<void> {
  await driver.execute({
    sql: "CREATE TABLE proof_verify (partition TEXT, id TEXT, bytes BLOB, PRIMARY KEY(partition, id))",
  });
  await driver.execute({
    sql: "INSERT INTO proof_verify VALUES ('big', 'value', zeroblob(65539)), ('small', 'value', zeroblob(3)), ('corrupt', 'value', x'010000')",
  });
  await assertVerifiedBlobs(driver);
  await assert.rejects(
    driver.verifyBlob({ ...plan, key: [{ column: "id", value: "value" }] }),
    /exactly one row/,
  );
  await assert.rejects(
    driver.verifyBlob({ ...plan, maxBytes: 65538 }),
    /type or size/,
  );

  const lease = await driver.transaction();
  // Admit everything before awaiting. A per-chunk queue would let this write
  // interleave with the first scan; one controller tail entry must own the scan.
  const before = lease.verifyBlob(plan);
  const write = lease.execute({
    sql: "UPDATE proof_verify SET bytes = zeroblob(3) WHERE partition = 'big'",
  });
  const after = lease.verifyBlob({ ...plan, expectedSize: 3 });
  const finish = lease.rollback();
  assert.deepEqual(await before, { sizeBytes: 65539, sha256: zeroDigest });
  await write;
  assert.deepEqual(await after, { sizeBytes: 3, sha256: smallDigest });
  await finish;

  const scope = await driver.openBinaryScope();
  // Full BACKING reservation, only three received bytes. This does not claim a
  // maximum-size payload/deduplication rehearsal or total native memory bound.
  const stage = await scope.begin({
    reservationBytes: STAGE_BUDGET_BYTES,
    expectedSize: 3,
  });
  await scope.append(stage, 0, new Uint8Array(3));
  const sealed = await scope.seal(stage);
  const claim = await scope.reserve(stage);
  await scope.close();
  await assert.rejects(
    withBinaryTransaction(driver, [claim], async (context) => {
      await context.executeBound(
        context.db.insert(payloads).values({
          partition: "transient",
          id: "value",
          bytes: sql`${sql.placeholder("payload")}`,
        }),
        new Map([["payload", claim]]),
      );
      assert.equal(
        (await driver.stageStats()).reservedBytes,
        STAGE_BUDGET_BYTES,
      );
      assert.equal((await context.verifyBlob(smallPlan)).sha256, sealed.sha256);
      const corrupted = await context.verifyBlob(corruptPlan);
      assert.notEqual(corrupted.sha256, sealed.sha256);
      throw new Error("Duplicate digest mismatch");
    }),
    /Duplicate digest mismatch/,
  );
  assert.equal((await driver.stageStats()).reservedBytes, 0);
  await assertVerifiedBlobs(driver);
}
