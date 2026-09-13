// Component fault harness: real Turso + ReadSnapshots/ExecutionOwner, with explicit
// acknowledgement faults in a backend decorator. Not a replacement RPC worker.
import assert from "node:assert/strict";
import {
  isMainThread,
  parentPort,
  threadId,
  workerData,
} from "node:worker_threads";
import { z } from "@brains/utils/zod";
import type { ResultSet } from "@libsql/client";
import { openNativeBackend } from "../../../src/turso-worker/native-backend";
import type {
  OwnerBackend,
  NativeTransaction,
} from "../../../src/turso-worker/backend-contract";
import { ExecutionOwner } from "../../../src/turso-worker/ownership";
import { ReadSnapshots } from "../../../src/turso-worker/read-snapshots";
import { VerificationBudget } from "../../../src/turso-worker/blob-verification";
import { NativeStatementUncertainError } from "../../../src/turso-worker/native-statement";
import {
  capabilitySchema,
  type StageCapability,
} from "../../../src/turso-worker/binary-protocol";
import { validateBudgetGrant } from "../../../src/turso-worker/budget-protocol";
import { serializeError } from "../../../src/turso-worker/error-protocol";
import {
  scanFaultSchema,
  scanMaterializationSchema,
  scanRequestSchema,
  type ScanState,
  type ScanEvent,
  type ScanOutcome,
  type ScanRequest,
} from "./read-scan-protocol";

if (isMainThread || !parentPort)
  throw new Error("Read scan faults require a worker");
const port = parentPort;
const boot = z
  .strictObject({
    url: z.string(),
    generation: z.string().uuid(),
    pool: z.string().uuid(),
    fault: scanFaultSchema,
    materialization: scanMaterializationSchema,
  })
  .parse(workerData);
const native = await openNativeBackend(boot.url);
await native.executeMultiple(
  "PRAGMA journal_mode=WAL; CREATE TABLE scan_blobs (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL); INSERT INTO scan_blobs VALUES (1, zeroblob(65539)); CREATE TABLE scan_progress (id INTEGER PRIMARY KEY)",
);
const gates = {
  scan: Promise.withResolvers<void>(),
  rollback: Promise.withResolvers<void>(),
};
const entered = new Set<"scan" | "rollback">();
let queryCalls = 0;
let gatedBackingBytes = 0;
let rollbackCalls = 0;
let rollbackCompleted = 0;
let queuedNativeCalls = 0;
let nativeClosed = false;
function send(event: ScanEvent): void {
  port.postMessage(event);
}
async function gate(phase: "scan" | "rollback"): Promise<void> {
  assert(!entered.has(phase));
  entered.add(phase);
  send({ kind: "gate", phase, state: state() });
  await gates[phase].promise;
}
const backend: OwnerBackend = {
  ...native,
  execute: async (statement) => {
    queuedNativeCalls++;
    return native.execute(statement);
  },
  transaction: async (mode): Promise<NativeTransaction> => {
    const transaction = await native.transaction(mode);
    return {
      ...transaction,
      execute: async (statement): Promise<ResultSet> => {
        // The first two calls are header + first chunk. The third invocation
        // proves the real synchronous sink already copied that first chunk.
        // Hold an already-admitted query, not a sleeping/polling worker thread.
        if (boot.materialization === "incremental" && queryCalls === 2)
          await gate("scan");
        queryCalls++;
        // Adoption holds the actual SDK result after native execute/statement close,
        // before handing its backing to ReadSnapshots. This is not a fetch-in-flight
        // or hash-loop gate. Resident/scratch admission already covers the operation.
        const adopted =
          boot.materialization === "adopt"
            ? await transaction.execute(statement)
            : undefined;
        if (adopted && queryCalls === 2) {
          const value: unknown = adopted.rows[0]?.[0];
          assert(value instanceof ArrayBuffer || value instanceof Uint8Array);
          gatedBackingBytes =
            value instanceof ArrayBuffer
              ? value.byteLength
              : value.buffer.byteLength;
          try {
            await gate("scan");
          } finally {
            gatedBackingBytes = 0;
          } // Gate witness only, not SDK cache/GC accounting.
        }
        const faultPosition = boot.materialization === "adopt" ? 2 : 3;
        // A deliberate read-only SQL fault at the selected scan position exercises
        // the real native error/statement-close path, not a fabricated result.
        if (
          queryCalls === faultPosition &&
          boot.fault === "native-state-loss"
        ) {
          await transaction.execute("SELECT abs(-9223372036854775808)");
          throw new Error(
            "Native integer-overflow fault unexpectedly succeeded",
          );
        }
        const result = adopted ?? (await transaction.execute(statement));
        if (queryCalls === faultPosition) {
          // Controlled post-query rejection, with a known-live native lease,
          // isolates ordinary rollback and combined primary/cleanup failures.
          if (boot.fault === "query" || boot.fault === "query-rollback")
            throw new Error("Injected active scan query failure");
          if (boot.fault === "statement-ack")
            throw new NativeStatementUncertainError(
              new Error("Injected statement finalization acknowledgement loss"),
            );
        }
        return result;
      },
      rollback: async (): Promise<void> => {
        rollbackCalls++;
        await gate("rollback");
        if (boot.fault === "rollback-before")
          throw new Error("Injected rollback failure before native call");
        await transaction.rollback();
        rollbackCompleted++;
        if (boot.fault === "rollback-after" || boot.fault === "query-rollback")
          throw new Error(
            "Injected rollback acknowledgement loss after native completion",
          );
      },
    };
  },
  close: async (): Promise<void> => {
    await native.close();
    nativeClosed = true;
  },
};
const owner = new ExecutionOwner(backend);
const reads = new ReadSnapshots(
  boot.generation,
  (id) => {
    // Same release policy as the proof dispatcher: uncertainty retains the parent
    // grant even if a local read allocation has already become unreachable.
    if (!owner.failed) send({ kind: "release", id });
  },
  () => undefined,
  boot.materialization,
); // No data ports are attached in this component fault harness.
const scratch = new VerificationBudget();
function state(): ScanState {
  return {
    materialization: boot.materialization,
    reads: reads.stats(),
    scratchSlots: scratch.stats().slots,
    failed: owner.failed,
    nativeActive: nativeClosed ? false : native.inTransaction(),
    queryCalls,
    gatedBackingBytes,
    rollbackCalls,
    rollbackCompleted,
    queuedNativeCalls,
  };
}
let capability: StageCapability | undefined;
let fill: Promise<ScanOutcome> | undefined;
let write: Promise<ScanOutcome> | undefined;
let lastId = 0;
const plan = {
  table: "scan_blobs",
  column: "bytes",
  key: [{ column: "id", value: 1 }],
  maxBytes: 65539,
};
async function outcome(
  operation: () => Promise<ScanOutcome>,
): Promise<ScanOutcome> {
  try {
    return await operation();
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}
async function handle(request: ScanRequest): Promise<ScanOutcome> {
  switch (request.op) {
    case "start": {
      assert(!fill);
      const scope = z
        .string()
        .uuid()
        .parse(reads.control({ action: "openScope" }, 0));
      const allocate = { action: "allocate", scope, plan } as const;
      validateBudgetGrant(
        { op: "read", command: allocate },
        request.resident,
        boot.pool,
        1,
      );
      capability = capabilitySchema.parse(reads.control(allocate, 1));
      const command = { action: "fill", capability } as const;
      validateBudgetGrant(
        { op: "read", command },
        request.scratch,
        boot.pool,
        2,
      );
      const current = capability;
      fill = outcome(async () => ({
        ok: true,
        value: await scratch.run(() => reads.fill(current, owner)),
      }));
      void fill
        .then(async (read) => {
          assert(
            write,
            "Queue witness must be admitted before releasing scan gate",
          );
          const written = await write;
          send({ kind: "settled", state: state(), read, write: written });
        })
        .catch((error: unknown) => {
          queueMicrotask(() => {
            throw error;
          });
        });
      return { ok: true };
    }
    case "queue":
      assert(fill && !write);
      write = outcome(async () => {
        await owner.execute("INSERT INTO scan_progress VALUES (1)");
        return { ok: true };
      });
      return { ok: true };
    case "inspect":
      return { ok: true };
    case "resume":
      assert(entered.delete(request.phase), "Gate is not waiting");
      gates[request.phase].resolve();
      return { ok: true };
    case "claim":
      assert(capability);
      return { ok: true, value: reads.claim(capability) };
    case "revoke":
      assert(capability);
      if (request.method === "all") reads.close();
      else if (request.method === "scope")
        reads.control({ action: "closeScope", scope: capability.scope }, 0);
      else reads.control({ action: "discard", capability }, 0);
      return { ok: true };
    case "shutdown":
      reads.close();
      await owner.close();
      return { ok: true };
  }
}
port.on("message", (input: unknown) => {
  const request = scanRequestSchema.parse(input);
  assert(request.id > lastId);
  lastId = request.id;
  void outcome(() => handle(request)).then((result) => {
    send({ kind: "reply", id: request.id, state: state(), outcome: result });
    if (request.op === "shutdown" && result.ok) port.close();
  });
});
send({ kind: "ready", pid: process.pid, threadId });
