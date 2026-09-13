// Component candidate only: adopt one SDK result backing in the native worker.
// No runtime factory/dispatcher changes; SDK/native peak allocations remain unknown.
import assert from "node:assert/strict";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { z } from "@brains/utils/zod";
import { PersistenceBudgetPool } from "../../../src/turso-worker/budget-pool";
import { budgetGrantSchema } from "../../../src/turso-worker/budget-protocol";
import { VERIFY_SCRATCH_BYTES } from "../../../src/turso-worker/blob-protocol";
import { STAGE_BUDGET_BYTES } from "../../../src/turso-worker/binary-protocol";
import { withNativeStatement } from "../../../src/turso-worker/native-statement";
import {
  errorSchema,
  serializeError,
  deserializeError,
} from "../../../src/turso-worker/error-protocol";
import { SqlWorkerDriver } from "../../../src/turso-worker/client";

const scenarioSchema: z.ZodEnum<{
  complete: "complete";
  cancel: "cancel";
  "close-ack": "close-ack";
  "rollback-ack": "rollback-ack";
}> = z.enum(["complete", "cancel", "close-ack", "rollback-ack"]);
export type ReadAdoptionScenario = z.output<typeof scenarioSchema>;
const optionsSchema = z.strictObject({
  sizeBytes: z.union([z.literal(65539), z.literal(STAGE_BUDGET_BYTES)]),
  scenario: scenarioSchema,
});
const bootSchema = optionsSchema.extend({
  url: z.string().url(),
  pool: z.string().uuid(),
});
const phaseSchema = z.enum(["row", "statement-closed", "rollback", "retained"]);
const commandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("start"),
    resident: budgetGrantSchema,
    scratch: budgetGrantSchema,
  }),
  z.strictObject({ kind: z.literal("release"), phase: phaseSchema }),
  z.strictObject({ kind: z.literal("finish") }),
]);
const eventSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready") }),
  z.strictObject({
    kind: z.literal("gate"),
    phase: phaseSchema,
    backingBytes: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
    inTransaction: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("done"),
    nativeClosed: z.boolean(),
    backingDropped: z.boolean(),
    observedBackingBytes: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
    writerCommitted: z.boolean(),
    hashAfterRollback: z.boolean(),
    error: errorSchema.optional(),
  }),
  z.strictObject({ kind: z.literal("failed"), error: errorSchema }),
]);
type Done = Extract<z.output<typeof eventSchema>, { kind: "done" }>;
export interface ReadAdoptionResult {
  scenario: ReadAdoptionScenario;
  sizeBytes: number;
  observedBackingBytes: number;
  fixtureAdoptedWithoutFullCopy: true;
  healthy: boolean;
  writerCommitted: boolean;
  hashAfterRollback: boolean;
  workerJoined: true;
  restored: true;
  sdkPeakAllocationBoundEstablished: false;
  runtimeReplaced: false;
}

async function nativeWorker(): Promise<void> {
  assert(!isMainThread);
  assert(parentPort);
  const port = parentPort;
  const options = bootSchema.parse(workerData);
  const start =
    Promise.withResolvers<
      Extract<z.output<typeof commandSchema>, { kind: "start" }>
    >();
  const finish = Promise.withResolvers<void>();
  const cancellation = new AbortController();
  const revoked = new Error("Adopted read revoked");
  let started = false;
  let finished = false;
  let nativeClosed = false;
  let pending:
    { phase: z.output<typeof phaseSchema>; resolve: () => void } | undefined;
  port.on("message", (input: unknown) => {
    const command = commandSchema.parse(input);
    if (command.kind === "start") {
      assert(!started);
      started = true;
      start.resolve(command);
    } else if (command.kind === "finish") {
      assert(nativeClosed);
      assert(!finished);
      finished = true;
      finish.resolve();
    } else {
      assert(pending);
      assert.equal(command.phase, pending.phase);
      if (command.phase === "row" && options.scenario !== "complete")
        cancellation.abort(revoked);
      const release = pending.resolve;
      pending = undefined;
      release();
    }
  });
  port.postMessage({ kind: "ready" });
  let backing: Uint8Array | undefined;
  let observedBackingBytes = 0;
  try {
    const grants = await start.promise;
    assert.deepEqual(grants.resident, {
      pool: options.pool,
      id: 1,
      kind: "resident",
      bytes: options.sizeBytes,
    });
    assert.deepEqual(grants.scratch, {
      pool: options.pool,
      id: 2,
      kind: "scratch",
      bytes: VERIFY_SCRATCH_BYTES,
    });
    assert.notEqual(process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"], "1");
    const { connect } = await import("@tursodatabase/database");
    const db = await connect(fileURLToPath(options.url));
    const execute = (
      sql: string,
      args: (number | string)[] = [],
    ): Promise<unknown> =>
      withNativeStatement(
        () => db.inTransaction,
        () => db.prepare(sql),
        async (statement) =>
          statement.columns().length === 0
            ? statement.run(args)
            : statement.raw(true).all(args),
      );
    const transition = async (sql: "BEGIN" | "ROLLBACK"): Promise<void> => {
      const before = sql === "ROLLBACK";
      assert.equal(db.inTransaction, before);
      const statement = await db.prepare(sql);
      assert.equal(db.inTransaction, before);
      await statement.run();
      assert.equal(db.inTransaction, !before);
      await Promise.resolve(statement.close());
      assert.equal(db.inTransaction, !before);
    };
    const gate = async (phase: z.output<typeof phaseSchema>): Promise<void> => {
      const release = Promise.withResolvers<void>();
      assert.equal(pending, undefined);
      pending = { phase, resolve: (): void => release.resolve() };
      if (options.sizeBytes === STAGE_BUDGET_BYTES)
        console.error(
          `[read-adoption] ${phase}: ${backing?.buffer.byteLength ?? 0} backing bytes retained`,
        );
      port.postMessage({
        kind: "gate",
        phase,
        backingBytes: backing?.buffer.byteLength ?? 0,
        inTransaction: db.inTransaction,
      });
      await release.promise;
    };
    if (options.sizeBytes === STAGE_BUDGET_BYTES)
      console.error(
        "[read-adoption] grants validated; seeding native 100 MiB fixture",
      );
    await execute(
      "CREATE TABLE adoption_payload (id TEXT PRIMARY KEY, bytes BLOB NOT NULL)",
    );
    await execute("INSERT INTO adoption_payload VALUES (?, zeroblob(?))", [
      "fixture",
      options.sizeBytes,
    ]);
    await transition("BEGIN");
    // Size/cardinality are checked in the same snapshot BEFORE fetching a body.
    assert.deepEqual(
      await execute(
        "SELECT typeof(bytes), length(bytes) FROM adoption_payload WHERE id = ? LIMIT 2",
        ["fixture"],
      ),
      [["blob", options.sizeBytes]],
    );
    if (options.sizeBytes === STAGE_BUDGET_BYTES)
      console.error("[read-adoption] header checked; fetching one SDK result");
    let failure: unknown;
    try {
      await withNativeStatement(
        () => db.inTransaction,
        async () => {
          const statement = await db.prepare(
            "SELECT bytes FROM adoption_payload WHERE id = ? LIMIT 2",
          );
          return {
            statement,
            close: async (): Promise<void> => {
              await Promise.resolve(statement.close());
              await gate("statement-closed");
              if (options.scenario === "close-ack")
                throw new Error("Injected adoption close acknowledgement loss");
            },
          };
        },
        async ({ statement }) => {
          const rows: unknown = await statement.raw(true).all(["fixture"]);
          assert(Array.isArray(rows));
          assert.equal(rows.length, 1);
          const row: unknown = rows[0];
          assert(Array.isArray(row));
          assert.equal(row.length, 1);
          const value: unknown = row[0];
          assert(value instanceof ArrayBuffer || value instanceof Uint8Array);
          const sdkBacking =
            value instanceof ArrayBuffer ? value : value.buffer;
          const view =
            value instanceof ArrayBuffer ? new Uint8Array(value) : value;
          assert.equal(view.byteLength, options.sizeBytes);
          assert.equal(view.byteOffset, 0);
          assert.equal(sdkBacking.byteLength, options.sizeBytes);
          // Wrap/adopt only: no new full allocation, Buffer.from, slice or copy.
          backing = view;
          assert.equal(backing.buffer, sdkBacking);
          observedBackingBytes = sdkBacking.byteLength;
          await gate("row");
          cancellation.signal.throwIfAborted();
        },
      );
    } catch (error) {
      failure = error;
    }
    if (failure !== undefined && failure !== revoked) {
      port.postMessage({
        kind: "done",
        nativeClosed: false,
        backingDropped: false,
        observedBackingBytes,
        writerCommitted: false,
        hashAfterRollback: false,
        error: serializeError(failure),
      });
      return;
    }
    await transition("ROLLBACK");
    await gate("rollback");
    if (options.scenario === "rollback-ack") {
      const cleanup = new Error(
        "Injected adoption rollback acknowledgement loss",
      );
      port.postMessage({
        kind: "done",
        nativeClosed: false,
        backingDropped: false,
        observedBackingBytes,
        writerCommitted: false,
        hashAfterRollback: false,
        error: serializeError(
          new AggregateError(
            [revoked, cleanup],
            "Adoption cancellation and rollback acknowledgement failed",
            { cause: cleanup },
          ),
        ),
      });
      return;
    }
    let writerCommitted = false;
    let hashAfterRollback = false;
    if (options.scenario === "complete") {
      await execute("UPDATE adoption_payload SET bytes = x'FF' WHERE id = ?", [
        "fixture",
      ]);
      writerCommitted = true;
      assert(backing);
      const actual = createHash("sha256");
      const expected = createHash("sha256");
      // Independent 32 KiB zero scratch is covered by the separate scratch grant.
      const zeros = new Uint8Array(32768);
      for (let offset = 0; offset < backing.byteLength; offset += 32768) {
        const length = Math.min(32768, backing.byteLength - offset);
        actual.update(backing.subarray(offset, offset + length));
        expected.update(zeros.subarray(0, length));
      }
      assert.equal(actual.digest("hex"), expected.digest("hex"));
      hashAfterRollback = true;
    }
    await gate("retained");
    backing = undefined; // Logical owner drop, not an assertion about GC/SDK caches.
    // SDK close alone does not establish a main-file-only checkpoint.
    await execute("PRAGMA wal_checkpoint(TRUNCATE)");
    await db.close();
    nativeClosed = true;
    port.postMessage({
      kind: "done",
      nativeClosed: true,
      backingDropped: true,
      observedBackingBytes,
      writerCommitted,
      hashAfterRollback,
      ...(failure === undefined ? {} : { error: serializeError(failure) }),
    });
    await finish.promise;
  } catch (error) {
    port.postMessage({ kind: "failed", error: serializeError(error) });
  } finally {
    // Uncertain workers deliberately stay alive/charged until parent termination.
    if (nativeClosed) port.close();
  }
}

export async function exerciseReadAdoption(input: {
  sizeBytes: number;
  scenario: ReadAdoptionScenario;
}): Promise<ReadAdoptionResult> {
  assert(isMainThread);
  assert.notEqual(process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"], "1");
  const options = optionsSchema.parse(input);
  if (options.scenario !== "complete" && options.sizeBytes !== 65539)
    throw new Error("Adoption fault cases require the explicit small fixture");
  const directory = await mkdtemp(join(tmpdir(), "turso-read-adoption-"));
  const path = join(directory, "original.db");
  const pool = new PersistenceBudgetPool();
  const member = pool.admit();
  const done = Promise.withResolvers<Done>();
  void done.promise.catch(() => undefined); // Awaited after each deterministic gate, including early startup failures.
  const phases = ["row", "statement-closed", "rollback", "retained"] as const;
  const gates = new Map(
    phases.map((phase) => [phase, Promise.withResolvers<void>()]),
  );
  let nextPhase = 0;
  let ready = false;
  let worker: Worker;
  try {
    worker = new Worker(new URL(import.meta.url), {
      workerData: { ...options, pool: pool.id, url: pathToFileURL(path).href },
    });
    member.bind(worker);
  } catch (error) {
    member.cancelUnstarted();
    throw error;
  }
  const exit = new Promise<number>((resolve) =>
    worker.once("exit", (code) => {
      resolve(code);
      done.reject(
        new Error(`Adoption worker exited before settlement (${code})`),
      );
    }),
  );
  worker.on("error", (error) => {
    member.fence();
    done.reject(error);
  });
  worker.on("message", (input: unknown) => {
    try {
      const event = eventSchema.parse(input);
      if (event.kind === "ready") {
        assert(!ready);
        ready = true;
        const resident = member.reserve(1, {
          kind: "resident",
          bytes: options.sizeBytes,
        });
        const scratch = member.reserve(2, {
          kind: "scratch",
          bytes: VERIFY_SCRATCH_BYTES,
        });
        worker.postMessage({ kind: "start", resident, scratch });
      } else if (event.kind === "failed") {
        member.fence();
        done.reject(deserializeError(event.error));
      } else if (event.kind === "gate") {
        assert.equal(event.phase, phases[nextPhase++]);
        assert.equal(event.backingBytes, options.sizeBytes);
        assert.equal(
          event.inTransaction,
          event.phase === "row" || event.phase === "statement-closed",
        );
        gates.get(event.phase)?.resolve();
      } else {
        if (!event.nativeClosed) member.fence();
        done.resolve(event);
      }
    } catch (error) {
      member.fence();
      done.reject(error);
    }
  });
  const wait = async (phase: (typeof phases)[number]): Promise<void> => {
    const gate = gates.get(phase);
    assert(gate);
    await Promise.race([
      gate.promise,
      done.promise.then((value) => {
        throw new Error(`Adoption settled before ${phase}`, {
          cause: value.error ? deserializeError(value.error) : undefined,
        });
      }),
    ]);
    assert.equal(pool.stats().residentBytes, options.sizeBytes);
    assert.equal(pool.stats().scratchBytes, VERIFY_SCRATCH_BYTES);
  };
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopping ??= (async (): Promise<void> => {
      await worker.terminate();
      await exit;
    })();
    return stopping;
  };
  const errors: unknown[] = [];
  let restored: SqlWorkerDriver | undefined;
  let result: ReadAdoptionResult | undefined;
  let restoreClosed = false;
  try {
    await wait("row");
    // Deny a second whole backing, or even one extra byte at the full ceiling.
    assert.throws(
      () =>
        member.reserve(3, {
          kind: "resident",
          bytes:
            options.sizeBytes === STAGE_BUDGET_BYTES ? 1 : STAGE_BUDGET_BYTES,
        }),
      /capacity exceeded/,
    );
    worker.postMessage({ kind: "release", phase: "row" });
    await wait("statement-closed");
    worker.postMessage({ kind: "release", phase: "statement-closed" });
    if (options.scenario !== "close-ack") {
      await wait("rollback");
      worker.postMessage({ kind: "release", phase: "rollback" });
      if (options.scenario !== "rollback-ack") {
        await wait("retained");
        worker.postMessage({ kind: "release", phase: "retained" });
      }
    }
    const outcome = await done.promise;
    const healthy =
      options.scenario === "complete" || options.scenario === "cancel";
    if (healthy && !outcome.nativeClosed)
      throw new Error("Adoption lifecycle unexpectedly uncertain", {
        cause: outcome.error ? deserializeError(outcome.error) : undefined,
      });
    assert.equal(outcome.nativeClosed, healthy);
    assert.equal(outcome.backingDropped, healthy);
    assert.equal(outcome.observedBackingBytes, options.sizeBytes);
    assert.equal(outcome.writerCommitted, options.scenario === "complete");
    assert.equal(outcome.hashAfterRollback, options.scenario === "complete");
    if (options.scenario === "complete") assert.equal(outcome.error, undefined);
    else {
      const error = deserializeError(outcome.error);
      if (options.scenario === "cancel")
        assert.equal(error.message, "Adopted read revoked");
      else {
        const graph = options.scenario === "close-ack" ? error.cause : error;
        assert(graph instanceof AggregateError);
        assert.equal(graph.cause, graph.errors[1]);
        assert.equal(graph.errors[0].message, "Adopted read revoked");
        assert.match(graph.errors[1].message, /acknowledgement loss/);
      }
    }
    if (healthy) {
      member.release(1, "resident");
      member.release(2, "scratch");
      assert.equal(pool.stats().members, 1);
      assert.equal(pool.stats().residentBytes, 0);
      worker.postMessage({ kind: "finish" });
      assert.equal(await exit, 0);
    } else {
      assert.equal(pool.stats().fencedMembers, 1);
      assert.equal(pool.stats().residentBytes, options.sizeBytes);
      assert.throws(
        () => member.reserve(4, { kind: "resident", bytes: 1 }),
        /not live/,
      );
      await stop(); // Only actual exit reclaims an uncertain owner's grants.
    }
    assert.equal(pool.stats().members, 0);
    assert.equal(pool.stats().residentBytes, 0);
    assert.equal(pool.stats().scratchBytes, 0);
    const restorePath = healthy ? join(directory, "restored.db") : path;
    if (healthy) await copyFile(path, restorePath); // Confirmed normal close: main-file-only restore.
    restored = new SqlWorkerDriver({
      url: pathToFileURL(restorePath).href,
      workerUrl: new URL(
        "../../../src/turso-worker/worker.ts",
        import.meta.url,
      ),
    });
    if (options.scenario === "complete")
      assert.equal(
        (
          await restored.execute({
            sql: "SELECT hex(bytes) FROM adoption_payload",
          })
        ).rows[0]?.[0],
        "FF",
      );
    else {
      assert.equal(options.sizeBytes, 65539); // Fault matrix intentionally small, never an implicit long verification run.
      assert.equal(
        (
          await restored.verifyBlob({
            table: "adoption_payload",
            column: "bytes",
            key: [{ column: "id", value: "fixture" }],
            maxBytes: options.sizeBytes,
            expectedSize: options.sizeBytes,
          })
        ).sha256,
        "d4f9bcbd9be765d114b85ab79d16c218fb5c1e03315f689603d48eed00bff97f",
      );
    }
    await restored.close();
    restoreClosed = true;
    result = {
      ...options,
      observedBackingBytes: outcome.observedBackingBytes,
      fixtureAdoptedWithoutFullCopy: true,
      healthy,
      writerCommitted: outcome.writerCommitted,
      hashAfterRollback: outcome.hashAfterRollback,
      workerJoined: true,
      restored: true,
      sdkPeakAllocationBoundEstablished: false,
      runtimeReplaced: false,
    };
  } catch (error) {
    errors.push(error);
  }
  try {
    await stop();
  } catch (error) {
    errors.push(error);
  }
  if (restored && !restoreClosed) {
    try {
      await restored.close();
      restoreClosed = true;
    } catch (error) {
      errors.push(error);
    }
  }
  if (result && restoreClosed && errors.length === 0)
    await rm(directory, { recursive: true, force: true });
  else console.error(`Retained read-adoption fixture: ${directory}`);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Read adoption and cleanup failed", {
      cause: errors.at(-1),
    });
  assert(result);
  return result;
}
if (!isMainThread) await nativeWorker();
