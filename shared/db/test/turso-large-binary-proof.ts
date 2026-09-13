// Opt-in full payload rehearsal. Generic binary rows, NOT runtime/image/RSS acceptance.
import assert from "node:assert/strict";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SqlWorkerDriver } from "../src/turso-worker/client";
import { PersistenceBudgetPool } from "../src/turso-worker/budget-pool";
import {
  STAGE_BUDGET_BYTES,
  STAGE_CHUNK_BYTES,
  type StageClaim,
} from "../src/turso-worker/binary-protocol";
import {
  withBinaryTransaction,
  type BinaryTransactionContext,
} from "../src/turso-worker/binary-transaction";
import { uploadNetworkFixture } from "./fixtures/turso-thread/network-exercise";
import { downloadNetworkFixture } from "./fixtures/turso-thread/network-read-exercise";
import type { BlobFacts, BlobPlan } from "../src/turso-worker/blob-protocol";

const SIZE = 100 * 1024 * 1024;
// Fixed all-0x5a fixture identity, independently checked by both peer processes
// and incremental persistence verification (never hashed on this controller).
const SHA = "412f60e4a630f1d60653186ad3d80f2a04e0e1ff779c21f46bf176e304c5a260";
assert.equal(STAGE_BUDGET_BYTES, SIZE); // Never enlarge a frame or shrink the accepted asset ceiling.
const payloads = sqliteTable("large_payloads", {
  sha256: text("sha256").primaryKey(),
  sizeBytes: integer("size_bytes").notNull(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
});
const options = {
  bridgeUrl: new URL(
    "../src/turso-worker/network-ingress-worker.ts",
    import.meta.url,
  ),
  producerUrl: new URL(
    "./fixtures/turso-thread/network-producer.ts",
    import.meta.url,
  ),
  readBridgeUrl: new URL(
    "../src/turso-worker/network-read-worker.ts",
    import.meta.url,
  ),
  readConsumerUrl: new URL(
    "./fixtures/turso-thread/network-read-consumer.ts",
    import.meta.url,
  ),
  bunExecutable: process.execPath,
};
const workerUrl = new URL("../src/turso-worker/worker.ts", import.meta.url);
const directory = await mkdtemp(join(tmpdir(), "turso-large-binary-"));
const path = join(directory, "source.db");
const pool = new PersistenceBudgetPool();
const driver = new SqlWorkerDriver({
  url: pathToFileURL(path).href,
  workerUrl,
  budget: pool,
});
let restored: SqlWorkerDriver | undefined;
async function publish(
  context: BinaryTransactionContext,
  claim: StageClaim,
  facts: BlobFacts,
  id: number,
): Promise<void> {
  await context.executeBound(
    context.db
      .insert(payloads)
      .values({
        sha256: facts.sha256,
        sizeBytes: facts.sizeBytes,
        bytes: sql`${sql.placeholder("payload")}`,
      })
      .onConflictDoNothing({ target: payloads.sha256 }),
    new Map([["payload", claim]]),
  );
  await context.db.run(
    sql`INSERT INTO large_references VALUES (${id}, ${facts.sha256})`,
  );
  await context.db.run(sql`INSERT INTO large_effects VALUES (${id})`);
}
async function assertRows(
  owner: SqlWorkerDriver,
  plan: BlobPlan,
  facts: BlobFacts,
): Promise<void> {
  assert.deepEqual(await owner.verifyBlob(plan), facts);
  assert.equal(
    (await owner.execute({ sql: "SELECT count(*) AS n FROM large_payloads" }))
      .rows[0]?.["n"],
    1,
  );
  assert.deepEqual(
    (
      await owner.execute({
        sql: "SELECT id FROM large_references JOIN large_effects USING(id) ORDER BY id",
      })
    ).rows.map((row) => row["id"]),
    [1, 2],
  );
  assert.equal(
    (
      await owner.execute({
        sql: "SELECT count(*) AS n FROM large_references WHERE id=3",
      })
    ).rows[0]?.["n"],
    0,
  );
}
const errors: unknown[] = [];
let report: Record<string, unknown> | undefined;
try {
  await driver.executeMultiple(
    "CREATE TABLE large_payloads (sha256 TEXT PRIMARY KEY, size_bytes INTEGER NOT NULL, bytes BLOB NOT NULL); CREATE TABLE large_references (id INTEGER PRIMARY KEY, sha256 TEXT NOT NULL REFERENCES large_payloads(sha256)); CREATE TABLE large_effects (id INTEGER PRIMARY KEY REFERENCES large_references(id), CHECK(id<3)); CREATE TABLE large_progress (id INTEGER PRIMARY KEY)",
  );
  let facts: BlobFacts | undefined;
  for (const id of [1, 2]) {
    const scope = await driver.openBinaryScope();
    try {
      const stage = await scope.begin({
        reservationBytes: SIZE,
        expectedSize: SIZE,
        expectedDigest: SHA,
      });
      const sealed = await uploadNetworkFixture(
        driver,
        pool,
        stage,
        SIZE,
        options,
      );
      const current = { sizeBytes: sealed.sizeBytes, sha256: sealed.sha256 };
      assert.equal(current.sizeBytes, SIZE);
      assert.equal(current.sha256, SHA);
      if (facts) assert.deepEqual(current, facts);
      else facts = current;
      assert.equal(pool.stats().residentBytes, SIZE);
      await assert.rejects(
        scope.begin({ reservationBytes: 1 }),
        /capacity exceeded/,
      );
      const read = await driver.openReadScope();
      try {
        await assert.rejects(
          read.prepare({
            table: "large_payloads",
            column: "bytes",
            key: [{ column: "sha256", value: facts.sha256 }],
            maxBytes: SIZE,
          }),
          /capacity exceeded/,
        );
      } catch (error) {
        try {
          await read.close();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            "Large quota check and read cleanup failed",
            { cause: cleanup },
          );
        }
        throw error;
      }
      await read.close();
      assert.equal(pool.stats().scratchSlots, 0);
      const claim = await scope.reserve(stage);
      await withBinaryTransaction(driver, [claim], async (context) => {
        if (id === 1) {
          // Real full-size BLOB + reference insertion is undone by an acknowledged
          // savepoint rollback. The same root-owned claim remains pinned, not replayed.
          await assert.rejects(
            context.transaction((child) => publish(child, claim, current, 3)),
            (error: unknown) => {
              assert(error instanceof Error);
              assert.match(error.message, /INSERT INTO large_effects/);
              assert(error.cause instanceof Error);
              assert.match(error.cause.message, /CHECK constraint failed/);
              return true;
            },
          );
          assert.equal(
            (
              await context.db.get<{ n: number }>(
                sql`SELECT count(*) AS n FROM large_payloads`,
              )
            ).n,
            0,
          );
          assert.equal(pool.stats().residentBytes, SIZE);
        }
        if (id === 2) {
          // Verify the existing full BLOB under this write lease while the new
          // 100 MiB stage remains pinned. Scratch is independent: no second
          // whole-buffer read reservation is available or requested.
          assert.deepEqual(
            await context.verifyBlob({
              table: "large_payloads",
              column: "bytes",
              key: [{ column: "sha256", value: current.sha256 }],
              maxBytes: SIZE,
              expectedSize: SIZE,
            }),
            current,
          );
          assert.equal(pool.stats().residentBytes, SIZE);
          assert.equal(pool.stats().scratchSlots, 0);
        }
        await publish(context, claim, current, id);
      });
    } catch (error) {
      try {
        await scope.close();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Large publication and scope cleanup failed",
          { cause: cleanup },
        );
      }
      throw error;
    }
    await scope.close();
    assert.equal(pool.stats().residentBytes, 0);
  }
  assert(facts);
  const plan: BlobPlan = {
    table: "large_payloads",
    column: "bytes",
    key: [{ column: "sha256", value: facts.sha256 }],
    maxBytes: SIZE,
    expectedSize: SIZE,
  };
  await assertRows(driver, plan, facts);
  const scope = await driver.openReadScope();
  try {
    const snapshot = await scope.prepare(plan);
    assert.equal(pool.stats().residentBytes, SIZE);
    const received = await downloadNetworkFixture(
      driver,
      pool,
      snapshot,
      options,
      async () => {
        assert.equal(pool.stats().scratchSlots, 0);
        await driver.execute({ sql: "INSERT INTO large_progress VALUES (1)" });
      },
    );
    assert.deepEqual(received, facts);
  } catch (error) {
    try {
      await scope.close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Large download and scope cleanup failed",
        { cause: cleanup },
      );
    }
    throw error;
  }
  await scope.close();
  assert.equal(pool.stats().residentBytes, 0);
  assert.equal(pool.stats().scratchBytes, 0);
  for (const budget of [
    pool.ingress,
    pool.egress,
    pool.networkIngress,
    pool.networkEgress,
  ])
    assert.equal(budget.stats().slots, 0);
  await driver.close();
  const restoredPath = join(directory, "restored.db");
  await copyFile(path, restoredPath);
  restored = new SqlWorkerDriver({
    url: pathToFileURL(restoredPath).href,
    workerUrl,
  });
  await assertRows(restored, plan, facts);
  assert.equal(
    (
      await restored.execute({
        sql: "SELECT count(*) AS n FROM large_progress",
      })
    ).rows[0]?.["n"],
    1,
  );
  report = {
    scope: "generic-large-binary-thread-proof",
    ...facts,
    uploadedPayloads: 2,
    chunkLimitBytes: STAGE_CHUNK_BYTES,
    fullPayloadIngress: true,
    fullPayloadEgress: true,
    nestedBlobRollback: true,
    deduplicatedPayloadRows: 1,
    duplicateVerifiedWhileStaged: true,
    atomicReferencesAndEffects: true,
    incrementalVerification: true,
    sharedResidentCeiling: SIZE,
    snapshotReleasedBeforeConsumer: true,
    durableMainFileRestore: true,
    peerProcessesJoined: true,
    authenticatedControl: false,
    packagedLargePayload: false,
    runtimeReplaced: false,
    imageProcessing: false,
    rssBoundEstablished: false,
  };
} catch (error) {
  errors.push(error);
}
let cleanupConfirmed = true;
for (const owner of [restored, driver]) {
  if (!owner) continue;
  try {
    await owner.close();
  } catch (error) {
    cleanupConfirmed = false;
    errors.push(
      new Error(
        `Large fixture retained after unconfirmed owner cleanup: ${directory}`,
        { cause: error },
      ),
    );
  }
}
if (cleanupConfirmed) {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
}
if (errors.length === 1) throw errors[0];
if (errors.length > 1)
  throw new AggregateError(errors, "Large binary proof and cleanup failed", {
    cause: errors.at(-1),
  });
assert(report);
console.log(JSON.stringify(report));
