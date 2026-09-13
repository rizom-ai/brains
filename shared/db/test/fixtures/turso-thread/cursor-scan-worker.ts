// Small native component proof; not the driver dispatcher or authenticated RPC.
import assert from "node:assert/strict";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { z } from "@brains/utils/zod";
import { withNativeStatement } from "../../../src/turso-worker/native-statement";
import { serializeError } from "../../../src/turso-worker/error-protocol";
import {
  CURSOR_SCAN_SIZE,
  cursorBootSchema,
  cursorCommandSchema,
  type CursorPhase,
  type CursorObservation,
  type CursorEvent,
} from "./cursor-scan-protocol";

assert(!isMainThread);
assert(parentPort);
assert.notEqual(process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"], "1");
const port = parentPort;
const options = cursorBootSchema.parse(workerData);
const CURSOR_SQL =
  options.plan === "sorted"
    ? "SELECT n, substr(bytes, n + 1, 32768) FROM cursor_blobs CROSS JOIN cursor_offsets WHERE id = ? ORDER BY n"
    : "SELECT n, substr(bytes, n + 1, 32768) FROM cursor_offsets CROSS JOIN cursor_blobs WHERE id = ? ORDER BY n";
const cancellation = new AbortController();
const revoked = new Error("Cursor read revoked");
let pending: { phase: CursorPhase; resolve: () => void } | undefined;
const state: CursorObservation = {
  rows: 0,
  nextCalls: 0,
  returnCalls: 0,
  closeCalls: 0,
  rollbackCalls: 0,
  probeCalls: 0,
  probeQueued: false,
  inTransaction: false,
};
function send(event: CursorEvent): void {
  port.postMessage(event);
}
port.on("message", (input: unknown) => {
  const command = cursorCommandSchema.parse(input);
  if (command.kind === "probe") {
    assert(!state.probeQueued);
    state.probeQueued = true;
    return;
  }
  assert(pending);
  assert.equal(command.phase, pending.phase);
  if (command.phase === "row" && options.scenario !== "complete")
    cancellation.abort(revoked);
  const { resolve } = pending;
  pending = undefined;
  resolve();
});
async function gate(phase: CursorPhase): Promise<void> {
  assert.equal(pending, undefined);
  const release = Promise.withResolvers<void>();
  pending = { phase, resolve: (): void => release.resolve() };
  send({ kind: "gate", phase, state: { ...state } });
  await release.promise;
}

async function run(): Promise<void> {
  const { connect } = await import("@tursodatabase/database");
  const db = await connect(fileURLToPath(options.url));
  const execute = (
    sql: string,
    args: (number | string)[] = [],
  ): Promise<unknown> =>
    withNativeStatement(
      () => db.inTransaction,
      () => db.prepare(sql),
      async (statement) => {
        if (statement.columns().length === 0) return statement.run(args);
        const rows: unknown = await statement.raw(true).all(args);
        return rows;
      },
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
    state.inTransaction = db.inTransaction;
  };
  if (options.operation === "recover") {
    assert.deepEqual(await execute("PRAGMA quick_check"), [["ok"]]);
    assert.deepEqual(await execute("SELECT length(bytes) FROM cursor_blobs"), [
      [CURSOR_SCAN_SIZE],
    ]);
    assert.deepEqual(await execute("SELECT count(*) FROM cursor_probes"), [
      [0],
    ]);
    await transition("BEGIN");
    const recoveredHash = createHash("sha256");
    let recoveredBytes = 0;
    await withNativeStatement(
      () => db.inTransaction,
      () => db.prepare(CURSOR_SQL),
      async (statement) => {
        for await (const input of statement.raw(true).iterate(["fixture"])) {
          const row: unknown = input;
          assert(Array.isArray(row));
          assert.equal(row[0], recoveredBytes);
          const value: unknown = row[1];
          assert(value instanceof ArrayBuffer || value instanceof Uint8Array);
          const bytes =
            value instanceof ArrayBuffer ? new Uint8Array(value) : value;
          assert.equal(
            bytes.byteLength,
            Math.min(32768, CURSOR_SCAN_SIZE - recoveredBytes),
          );
          assert(bytes.buffer.byteLength <= 32768);
          recoveredHash.update(bytes);
          recoveredBytes += bytes.byteLength;
        }
      },
    );
    assert.equal(recoveredBytes, CURSOR_SCAN_SIZE);
    assert.equal(
      recoveredHash.digest("hex"),
      "d4f9bcbd9be765d114b85ab79d16c218fb5c1e03315f689603d48eed00bff97f",
    );
    await transition("ROLLBACK");
    await execute("INSERT INTO cursor_probes VALUES (1)");
    state.probeCalls++;
    await db.close();
    send({ kind: "done", state, nativeClosed: true, recovered: true });
    return;
  }
  await execute(
    "CREATE TABLE cursor_blobs (id TEXT PRIMARY KEY, bytes BLOB NOT NULL)",
  );
  await execute("INSERT INTO cursor_blobs VALUES (?, zeroblob(?))", [
    "fixture",
    CURSOR_SCAN_SIZE,
  ]);
  await execute("CREATE TABLE cursor_offsets (n INTEGER PRIMARY KEY)");
  await execute("INSERT INTO cursor_offsets VALUES (0), (32768), (65536)");
  await execute("CREATE TABLE cursor_probes (id INTEGER PRIMARY KEY)");
  if (options.plan === "offsets-first") {
    const opcodes = await withNativeStatement(
      () => db.inTransaction,
      () => db.prepare(`EXPLAIN ${CURSOR_SQL}`),
      async (statement) => {
        const rows = z
          .array(z.object({ opcode: z.string().max(64) }))
          .min(1)
          .max(512)
          .parse(await statement.all(["fixture"]));
        return rows.map((row) => row.opcode);
      },
    );
    assert(
      !opcodes.some(
        (opcode) => opcode.startsWith("Sorter") || opcode === "Sort",
      ),
      "Offsets-first component unexpectedly requires a native sorter",
    );
  }
  await transition("BEGIN");
  const hash = createHash("sha256");
  let failure: unknown;
  let returnUncertain: unknown;
  try {
    await withNativeStatement(
      () => db.inTransaction,
      async () => {
        const statement = await db.prepare(CURSOR_SQL);
        return {
          statement,
          close: async (): Promise<void> => {
            if (returnUncertain !== undefined) throw returnUncertain;
            await Promise.resolve(statement.close());
            state.closeCalls++;
            state.inTransaction = db.inTransaction;
            await gate("statement-closed");
            if (options.scenario === "close-ack")
              throw new Error("Injected cursor close acknowledgement loss");
          },
        };
      },
      async ({ statement }) => {
        const iterator = statement.raw(true).iterate(["fixture"]);
        let primary: unknown;
        try {
          for (;;) {
            cancellation.signal.throwIfAborted();
            state.nextCalls++;
            const next = await iterator.next();
            if (next.done) break;
            const row: unknown = next.value;
            assert(Array.isArray(row));
            const offset = state.rows * 32768;
            assert.equal(row[0], offset);
            const value: unknown = row[1];
            assert(value instanceof ArrayBuffer || value instanceof Uint8Array);
            const bytes =
              value instanceof ArrayBuffer ? new Uint8Array(value) : value;
            assert.equal(
              bytes.byteLength,
              Math.min(32768, CURSOR_SCAN_SIZE - offset),
            );
            assert(bytes.buffer.byteLength <= 32768);
            hash.update(bytes);
            state.rows++;
            if (state.rows === 1) await gate("row");
          }
        } catch (error) {
          primary = error;
        }
        // Do not initiate additional native cleanup after observed state loss.
        try {
          assert.equal(db.inTransaction, true);
        } catch (cause) {
          returnUncertain =
            primary === undefined
              ? cause
              : new AggregateError(
                  [primary, cause],
                  "Cursor state became uncertain",
                  { cause },
                );
          throw returnUncertain;
        }
        // iterate() holds the SDK execution lock while suspended at a yielded
        // row. Return/reset must finish BEFORE close or a rollback statement.
        try {
          await iterator.return();
          state.returnCalls++;
          if (options.scenario === "return-ack")
            throw new Error("Injected cursor return acknowledgement loss");
        } catch (cleanup) {
          returnUncertain =
            primary === undefined
              ? cleanup
              : new AggregateError(
                  [primary, cleanup],
                  "Cursor read and iterator return failed",
                  { cause: cleanup },
                );
          throw returnUncertain;
        }
        if (primary !== undefined) throw primary;
      },
    );
  } catch (error) {
    failure = error;
  }
  if (failure !== undefined && failure !== revoked) {
    // An uncertain statement acknowledgement is not rollback permission.
    send({
      kind: "done",
      state,
      nativeClosed: false,
      recovered: false,
      error: serializeError(failure),
    });
    return;
  }
  if (failure === undefined)
    assert.equal(
      hash.digest("hex"),
      "d4f9bcbd9be765d114b85ab79d16c218fb5c1e03315f689603d48eed00bff97f",
    );
  await transition("ROLLBACK");
  state.rollbackCalls++;
  await gate("rollback-completed");
  if (options.scenario === "rollback-ack") {
    const cleanup = new Error("Injected cursor rollback acknowledgement loss");
    send({
      kind: "done",
      state,
      nativeClosed: false,
      recovered: false,
      error: serializeError(
        new AggregateError(
          [revoked, cleanup],
          "Cursor cancellation and rollback acknowledgement failed",
          { cause: cleanup },
        ),
      ),
    });
    return;
  }
  // This is a component-only queued probe, not the production ExecutionOwner gate.
  assert(state.probeQueued);
  await execute("INSERT INTO cursor_probes VALUES (1)");
  state.probeCalls++;
  assert.deepEqual(await execute("SELECT count(*) FROM cursor_probes"), [[1]]);
  await db.close();
  send({
    kind: "done",
    state,
    nativeClosed: true,
    recovered: false,
    ...(failure === undefined ? {} : { error: serializeError(failure) }),
  });
}
try {
  await run();
} catch (error) {
  send({ kind: "failed", error: serializeError(error) });
} finally {
  port.close();
}
