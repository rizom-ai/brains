// Shared acceptance body for source, packed JS and compiled-consumer proofs.
import assert from "node:assert/strict";
import { copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { TursoThreadProof, type ProofTransaction } from "./client";
import { exerciseStagedBinaries, assertStagedRows } from "./binary-exercise";
import { exerciseLibsqlSession, assertOrmRows } from "./orm-exercise";
import { exerciseFailedFinalization } from "./failure-exercise";

export interface ThreadProofReport {
  scope: "isolated-turso-thread-driver";
  nativeThreadId: number;
  sameOwnerProcess: true;
  mainControlWhileWorkerBlocked: true;
  callerBuffersPreserved: true;
  transactionIsolation: true;
  durableMainFileRestore: true;
  workerStageLifecycle: true;
  transactionalResidentBlob: true;
  libsqlSessionCompatibility: true;
  nestedResidentRollback: true;
  failedFinalizationFenced: true;
  runtimeReplaced: false;
  largeAssetStaging: false;
}

export async function exerciseThreadDriver(
  url: string,
  workerUrl: URL,
): Promise<ThreadProofReport> {
  const driver = new TursoThreadProof({ url, workerUrl });
  let lease: ProofTransaction | undefined;
  let restored: TursoThreadProof | undefined;
  try {
    const placement = await driver.initialize();
    assert.ok(placement.threadId > 0);
    assert.equal(placement.pid, process.pid);
    await driver.execute({
      sql: "CREATE TABLE proof (id INTEGER PRIMARY KEY, name TEXT, bytes BLOB, occurred INTEGER, enabled INTEGER)",
    });
    const backing = new Uint8Array(1024).fill(88);
    const view = backing.subarray(31, 34);
    view.set([0, 128, 255]);
    const inserted = await driver.execute({
      sql: "INSERT INTO proof VALUES (1, $name, $bytes, $occurred, $enabled)",
      args: {
        name: "preserved",
        bytes: view,
        occurred: new Date(1234),
        enabled: true,
      },
    });
    assert.equal(inserted.rowsAffected, 1);
    assert.equal(inserted.lastInsertRowid, 1n);
    assert.equal(backing.byteLength, 1024);
    assert.deepEqual(Array.from(view), [0, 128, 255]);
    assert.equal(backing[30], 88);
    const selected = await driver.execute({
      sql: "SELECT name, bytes, occurred, enabled FROM proof WHERE id = ?",
      args: [1],
    });
    const row = selected.rows[0];
    assert.ok(row);
    const bytes = row["bytes"];
    assert.ok(bytes instanceof ArrayBuffer);
    assert.deepEqual(Array.from(new Uint8Array(bytes)), [0, 128, 255]);
    assert.deepEqual(Object.keys(row), [
      "name",
      "bytes",
      "occurred",
      "enabled",
    ]);
    assert.deepEqual(Array.prototype.slice.call(row), [
      "preserved",
      bytes,
      1234,
      1,
    ]);

    lease = await driver.transaction();
    const rolledBack = lease.execute({
      sql: "INSERT INTO proof (id, name) VALUES (?, ?)",
      args: [2, "rollback"],
    });
    const outside = driver.execute({
      sql: "INSERT INTO proof (id, name) VALUES (3, 'outside lease')",
    });
    await lease.rollback();
    await rolledBack;
    await outside;
    assert.deepEqual(
      (
        await driver.execute({ sql: "SELECT id FROM proof ORDER BY id" })
      ).rows.map((item) => item["id"]),
      [1, 3],
    );
    await assert.rejects(
      driver.execute({ sql: "SELECT 1" }, lease.id),
      /Unknown or finished/,
    );

    await exerciseLibsqlSession(driver, url);
    await exerciseStagedBinaries(driver);

    const gate = new SharedArrayBuffer(4);
    const held = driver.holdThreadForProof(gate);
    // The HTTP handler cannot execute if the gate is blocking this main thread.
    // No sleeps, latency thresholds or test-only timeout overrides are involved.
    const http = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (): Response => new Response("main-control"),
    });
    try {
      await held.entered;
      assert.equal(Atomics.load(new Int32Array(gate), 0), 0);
      const response = await fetch(`http://127.0.0.1:${http.port}/`);
      assert.equal(await response.text(), "main-control");
      assert.equal(Atomics.load(new Int32Array(gate), 0), 0);
    } finally {
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      try {
        await held.done;
      } finally {
        await http.stop(true);
      }
    }

    lease = await driver.transaction();
    const admitted = lease.execute({
      sql: "INSERT INTO proof (id, name) VALUES (?, ?)",
      args: [4, "admitted before close"],
    });
    const queued = driver.execute({
      sql: "INSERT INTO proof (id, name) VALUES (6, 'queued before close')",
    });
    const closing = driver.close();
    assert.equal(driver.close(), closing);
    await assert.rejects(driver.execute({ sql: "SELECT 1" }), /closing/);
    await assert.rejects(driver.transaction(), /closing/);
    await admitted;
    // Closing fences new work, but an already-admitted transaction can settle.
    await lease.execute({
      sql: "INSERT INTO proof (id, name) VALUES ($id, $name)",
      args: { id: 5, name: "finish admitted lease" },
    });
    await lease.commit();
    await queued;
    await closing;

    const restoredUrl = new URL("restored-main-file.db", url).href;
    await copyFile(
      fileURLToPath(url),
      fileURLToPath(restoredUrl),
      constants.COPYFILE_EXCL,
    );
    restored = new TursoThreadProof({ url: restoredUrl, workerUrl });
    const restoredPlacement = await restored.initialize();
    assert.notEqual(restoredPlacement.generation, placement.generation);
    await assert.rejects(
      restored.execute({ sql: "SELECT 1" }, lease.id),
      /Unknown or finished/,
    );
    assert.deepEqual(
      (
        await restored.execute({ sql: "SELECT id FROM proof ORDER BY id" })
      ).rows.map((item) => item["id"]),
      [1, 3, 4, 5, 6],
    );
    assert.equal(
      (
        await restored.execute({
          sql: "SELECT hex(bytes) AS bytes FROM proof WHERE id = 1",
        })
      ).rows[0]?.["bytes"],
      "0080FF",
    );
    await assertStagedRows(restored);
    await assertOrmRows(restored);
    await exerciseFailedFinalization(
      new URL("failed-finalization.db", url).href,
      workerUrl,
    );
    return {
      scope: "isolated-turso-thread-driver",
      nativeThreadId: placement.threadId,
      sameOwnerProcess: true,
      mainControlWhileWorkerBlocked: true,
      callerBuffersPreserved: true,
      transactionIsolation: true,
      durableMainFileRestore: true,
      workerStageLifecycle: true,
      transactionalResidentBlob: true,
      libsqlSessionCompatibility: true,
      nestedResidentRollback: true,
      failedFinalizationFenced: true,
      runtimeReplaced: false,
      largeAssetStaging: false,
    };
  } finally {
    try {
      await lease?.rollback();
    } finally {
      try {
        await driver.close();
      } finally {
        await restored?.close();
      }
    }
  }
}
