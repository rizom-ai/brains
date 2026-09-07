// Test-only native execution owner. Never imported by the runtime driver.
import {
  isMainThread,
  parentPort,
  threadId,
  workerData,
} from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { StagedBinaries } from "./staged-binaries";
import type { ResultSet } from "@libsql/client";
import {
  ExecutionOwner,
  type OwnedTransaction,
  type OwnerBackend,
} from "./ownership";
import {
  MAX_IN_FLIGHT,
  MAX_MESSAGE_BYTES,
  MAX_PENDING_BYTES,
  commandBytes,
  isCleanupCommand,
  parseBoot,
  parseRequest,
  serializeError,
  type ProofCommand,
  type ProofPlacement,
  type ProofReply,
  type ProofResult,
  type ProofRowValue,
} from "./protocol";

if (isMainThread || !parentPort)
  throw new Error("Native proof entry must run in a worker thread");
if (process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"] === "1")
  throw new Error("Local SQLite opens are forbidden in this process");
const port = parentPort;
const boot = parseBoot(workerData);
const placement: ProofPlacement = {
  generation: boot.generation,
  threadId,
  pid: process.pid,
};
// This import and every native operation stay in this thread. No second handle.
const { createTursoClient, closeSqliteClient } =
  await import("../../../src/turso-client");
const client = createTursoClient({ url: boot.url });
try {
  await client.execute("PRAGMA journal_mode = WAL");
} catch (error) {
  // Preserve nested native-loader diagnostics across Bun's worker error event.
  throw new Error(
    `Native proof startup failed: ${inspect(error, { depth: 5 })}`,
    { cause: error },
  );
}
port.postMessage({ kind: "ready", ...placement } satisfies ProofReply);

const backend: OwnerBackend = {
  execute: (statement) => client.execute(statement),
  executeMultiple: (sql) => client.executeMultiple(sql),
  transaction: (mode) => client.transaction(mode),
  setForeignKeys: (enabled) =>
    client.executeMultiple(
      enabled ? "PRAGMA foreign_keys = ON" : "PRAGMA foreign_keys = OFF",
    ),
  foreignKeysEnabled: async () => {
    const value = (await client.execute("PRAGMA foreign_keys")).rows[0]?.[0];
    if (value !== 0 && value !== 1)
      throw new Error("Invalid native foreign-key state");
    return value === 1;
  },
  close: () => closeSqliteClient(client),
};
const owner = new ExecutionOwner(backend);
const leases = new Map<string, OwnedTransaction>();
const stages = new StagedBinaries(boot.generation);
let ordinary = 0;
let controls = 0;
let cleanupRequests = 0;
let pendingBytes = 0;
let lastRequestId = 0;

function getLease(id: string): OwnedTransaction {
  const lease = leases.get(id);
  if (!lease || lease.closed)
    throw new Error("Unknown or finished transaction lease");
  return lease;
}

function encodeResult(
  result: ResultSet,
  budget: number = MAX_MESSAGE_BYTES,
): { value: ProofResult; transfers: ArrayBuffer[]; bytes: number } {
  try {
    return encodeResultValue(result, budget);
  } catch (error) {
    const failure = new Error(
      `SQL completed but its result is unavailable; changes may have committed: ${serializeError(error).message}`,
      { cause: error },
    );
    Object.defineProperty(failure, "code", { value: "RESULT_UNAVAILABLE" });
    throw failure;
  }
}

function encodeResultValue(
  result: ResultSet,
  budget: number,
): {
  value: ProofResult;
  transfers: ArrayBuffer[];
  bytes: number;
} {
  const transfers: ArrayBuffer[] = [];
  let bytes = [...result.columns, ...result.columnTypes].reduce(
    (sum, column) => sum + Buffer.byteLength(column) + 16,
    256,
  );
  if (bytes > budget)
    throw new Error("Proof driver result byte limit exceeded");
  const rows = result.rows.map((row) =>
    Array.from({ length: row.length }, (_, index): ProofRowValue => {
      const value: unknown = row[index];
      const size =
        typeof value === "string"
          ? Buffer.byteLength(value)
          : value instanceof ArrayBuffer || value instanceof Uint8Array
            ? value.byteLength
            : 8;
      bytes += size + 16;
      if (bytes > budget)
        throw new Error("Proof driver result byte limit exceeded");
      if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        // Allocate exact, owned backing storage in the worker, never transfer a
        // pooled/native Buffer allocation or copy a large result on the caller.
        const owned = Uint8Array.from(
          value instanceof ArrayBuffer ? new Uint8Array(value) : value,
        ).buffer;
        transfers.push(owned);
        return owned;
      }
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "bigint"
      )
        return value;
      throw new Error("Unsupported native row value");
    }),
  );
  return {
    value: {
      columns: result.columns,
      columnTypes: result.columnTypes,
      rows,
      rowsAffected: result.rowsAffected,
      ...(result.lastInsertRowid !== undefined && {
        lastInsertRowid: result.lastInsertRowid,
      }),
    },
    transfers,
    bytes,
  };
}

async function execute(
  command: ProofCommand,
  id: number,
): Promise<{ value: unknown; transfers: ArrayBuffer[] }> {
  owner.assertHealthy();
  switch (command.op) {
    case "execute": {
      const statement = {
        sql: command.statement.sql,
        ...(command.statement.args !== undefined && {
          args: command.statement.args,
        }),
      };
      let result: ResultSet;
      if (command.lease === undefined) result = await owner.execute(statement);
      else result = await getLease(command.lease).execute(statement);
      return encodeResult(result);
    }
    case "batch":
    case "migrate": {
      const statements = command.statements.map(({ sql, args }) => ({
        sql,
        ...(args !== undefined && { args }),
      }));
      let results: ResultSet[];
      if (command.op === "migrate") results = await owner.migrate(statements);
      else if (command.lease === undefined)
        results = await owner.batch(statements, command.mode);
      else results = await getLease(command.lease).batch(statements);
      const value: ProofResult[] = [];
      const transfers: ArrayBuffer[] = [];
      let remaining = MAX_MESSAGE_BYTES;
      for (const result of results) {
        const encoded = encodeResult(result, remaining);
        remaining -= encoded.bytes;
        value.push(encoded.value);
        transfers.push(...encoded.transfers);
      }
      return { value, transfers };
    }
    case "script": {
      if (command.lease === undefined) await owner.executeMultiple(command.sql);
      else await getLease(command.lease).executeMultiple(command.sql);
      return { value: undefined, transfers: [] };
    }
    case "binary":
      return { value: stages.execute(command.command, id), transfers: [] };
    case "executeBound": {
      const lease = getLease(command.lease);
      const result = await lease.execute({
        sql: command.statement.sql,
        args: stages.arguments(command.lease, command.statement),
      });
      return encodeResult(result);
    }
    case "begin": {
      const token = randomUUID();
      stages.attach(token, command.claims ?? []);
      try {
        const transaction = await owner.transaction(command.mode);
        leases.set(token, transaction);
        return { value: token, transfers: [] };
      } catch (error) {
        stages.finishLease(token);
        throw error;
      }
    }
    case "finish": {
      const lease = getLease(command.lease);
      try {
        await lease[command.action]();
      } finally {
        leases.delete(command.lease);
        stages.finishLease(command.lease);
      }
      return { value: undefined, transfers: [] };
    }
    case "close":
      stages.closeAdmission();
      await owner.close();
      return { value: undefined, transfers: [] };
    case "gate": {
      port.postMessage({
        kind: "gate-entered",
        id,
        ...placement,
      } satisfies ProofReply);
      const state = new Int32Array(command.state);
      while (Atomics.load(state, 0) === 0) Atomics.wait(state, 0, 0);
      return { value: undefined, transfers: [] };
    }
  }
}

async function receive(input: unknown): Promise<void> {
  const request = parseRequest(input);
  if (request.generation !== boot.generation || request.id <= lastRequestId)
    throw new Error("Stale or replayed proof driver command");
  lastRequestId = request.id;
  const control =
    request.command.op === "finish" || request.command.op === "close";
  const cleanup = isCleanupCommand(request.command);
  const size = commandBytes(request.command);
  let admitted = false;
  let reply: ProofReply;
  let transfers: ArrayBuffer[] = [];
  try {
    if (
      cleanup
        ? cleanupRequests >= 2
        : control
          ? controls >= 3
          : ordinary >= MAX_IN_FLIGHT || pendingBytes + size > MAX_PENDING_BYTES
    )
      throw new Error("Proof driver overloaded");
    admitted = true;
    if (cleanup) cleanupRequests++;
    else if (control) controls++;
    else {
      ordinary++;
      pendingBytes += size;
    }
    const result = await execute(request.command, request.id);
    transfers = result.transfers;
    reply = {
      kind: "result",
      id: request.id,
      value: result.value,
      ...placement,
    };
  } catch (error) {
    reply = {
      kind: owner.failed ? "owner-failed" : "error",
      id: request.id,
      error: serializeError(error),
      ...placement,
    };
  } finally {
    if (admitted) {
      if (cleanup) cleanupRequests--;
      else if (control) controls--;
      else {
        ordinary--;
        pendingBytes -= size;
      }
    }
  }
  port.postMessage(reply, transfers);
  if (transfers.some((buffer) => buffer.byteLength !== 0))
    throw new Error("Runtime did not transfer result buffer ownership");
  if (request.command.op === "close") {
    // A failed close is reported, never mistaken for a checkpoint acknowledgement.
    port.close();
  }
}
port.on("message", (input: unknown) => {
  void receive(input).catch((error: unknown) => {
    // Invalid protocol or failed ownership transfer is fatal, not a SQL retry.
    queueMicrotask(() => {
      throw error;
    });
  });
});
