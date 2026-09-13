// Test-only native execution owner. Never imported by the runtime driver.
import { workerData } from "node:worker_threads";
import { CommandAdmission } from "./command-admission";
import { LeaseRegistry } from "./lease-registry";
import { StagedBinaries } from "./staged-binaries";
import { DirectUploads } from "./direct-uploads";
import { ReadSnapshots } from "./read-snapshots";
import { DirectReads } from "./direct-reads";
import { MigrationPlans } from "./migration-plans";
import { VerificationBudget } from "./blob-verification";
import { serializeError } from "./error-protocol";
import { encodeResult, encodeResults } from "./result-codec";
import { validateBudgetGrant } from "./budget-protocol";
import type { BlobPlan, BlobFacts } from "./blob-protocol";
import type { OwnedTransaction } from "./ownership";
import { initializeSqlWorker } from "./worker-bootstrap";
import { executeSqlCommand } from "./sql-command";
import {
  commandBytes,
  isCleanupCommand,
  isControlCommand,
  parseRequest,
  type WorkerCommand,
  type WorkerRequest,
  type WorkerReply,
} from "./protocol";

const { owner, boot, placement, port } = await initializeSqlWorker(workerData);
port.postMessage({ kind: "ready", ...placement } satisfies WorkerReply);

const stages = new StagedBinaries(
  boot.generation,
  (id) => {
    // Uncertain native finalization cannot establish that retained bindings died.
    // Leave these parent reservations pinned until the actual worker exit.
    if (!owner.failed)
      port.postMessage({
        kind: "budget-release",
        id,
        ...placement,
      } satisfies WorkerReply);
  },
  (id) => uploads.revoke(id),
);
const leases = new LeaseRegistry(owner, stages);
const uploads = new DirectUploads(stages, boot.budget, (id, result) =>
  port.postMessage({
    kind: "upload-closed",
    id,
    result,
    ...placement,
  } satisfies WorkerReply),
);
const readSnapshots = new ReadSnapshots(
  boot.generation,
  (id) => {
    if (!owner.failed)
      port.postMessage({
        kind: "budget-release",
        id,
        ...placement,
      } satisfies WorkerReply);
  },
  (id) => readTransfers.revoke(id),
  "adopt",
);
const readTransfers = new DirectReads(
  readSnapshots,
  boot.budget,
  (id, result) =>
    port.postMessage({
      kind: "read-closed",
      id,
      result,
      ...placement,
    } satisfies WorkerReply),
);
const migrationPlans = new MigrationPlans(boot.generation);
const verificationBudget = new VerificationBudget();
const admission = new CommandAdmission({ role: "receiver" });
let lastRequestId = 0;
const requestCompletions = new Map<number, Promise<void>>();
let closingRequest: number | undefined;

function getLease(id: string): OwnedTransaction {
  return leases.get(id);
}

async function verifySnapshot(plan: BlobPlan): Promise<BlobFacts> {
  const lease = await owner.transaction("read");
  let facts: BlobFacts;
  try {
    facts = await lease.verifyBlob(plan);
  } catch (error) {
    try {
      await lease.rollback();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "BLOB verification failed; snapshot rollback could not be confirmed",
        { cause: cleanup },
      );
    }
    throw error;
  }
  await lease.rollback(); // SELECT-only snapshot: release before returning facts.
  return facts;
}

async function execute(
  command: WorkerCommand,
  id: number,
): Promise<{ value: unknown; transfers: ArrayBuffer[] }> {
  owner.assertHealthy();
  switch (command.op) {
    case "cancelTransfer":
      await (command.direction === "upload" ? uploads : readTransfers).cancel(
        command.id,
      );
      return { value: undefined, transfers: [] };
    case "read": {
      const read = command.command;
      const value =
        read.action === "fill"
          ? await verificationBudget.run(() =>
              readSnapshots.fill(read.capability, owner),
            )
          : readSnapshots.control(read, id);
      return { value, transfers: [] };
    }
    case "openRead":
      readTransfers.open(command.grant, command.port);
      return { value: undefined, transfers: [] };
    case "openUpload":
      uploads.open(command.grant, command.port);
      return { value: undefined, transfers: [] };
    case "execute":
    case "batch":
    case "migrate":
    case "script": {
      const result = await executeSqlCommand(owner, getLease, command);
      if (result.kind === "result") return encodeResult(result.result);
      if (result.kind === "results") return encodeResults(result.results);
      return { value: undefined, transfers: [] };
    }
    case "verifyBlob": {
      const value = await verificationBudget.run(() =>
        command.lease === undefined
          ? verifySnapshot(command.plan)
          : getLease(command.lease).verifyBlob(command.plan),
      );
      return { value, transfers: [] };
    }
    case "binary":
      return { value: stages.execute(command.command, id), transfers: [] };
    case "migration": {
      const result = await migrationPlans.execute(
        command.command,
        id,
        async (statements) =>
          encodeResults(
            await owner.migrate(
              statements.map(({ sql, args }) => ({
                sql,
                ...(args !== undefined && { args }),
              })),
            ),
          ),
      );
      if (result !== undefined && "value" in result) return result;
      return { value: result, transfers: [] };
    }
    case "executeBound": {
      const lease = getLease(command.lease);
      const result = await lease.execute({
        sql: command.statement.sql,
        args: stages.arguments(command.lease, command.statement),
      });
      return encodeResult(result);
    }
    case "begin":
      return {
        value: await leases.begin(command.mode, command.claims ?? []),
        transfers: [],
      };
    case "savepoint": {
      const control = command.command;
      const lease = getLease(control.lease);
      if (control.action === "begin") {
        await lease.savepoint("begin", id);
        return {
          value: { generation: boot.generation, lease: control.lease, id },
          transfers: [],
        };
      }
      if (
        control.token.generation !== boot.generation ||
        control.token.lease !== control.lease
      )
        throw new Error("Foreign savepoint capability");
      await lease.savepoint(control.action, control.token.id);
      return { value: undefined, transfers: [] };
    }
    case "finish":
      await leases.finish(command.lease, command.action);
      return { value: undefined, transfers: [] };
    case "close": {
      const uploadsClosed = uploads.close();
      const readsClosed = readTransfers.close();
      readSnapshots.close();
      stages.closeAdmission();
      migrationPlans.closeAdmission();
      await Promise.all([uploadsClosed, readsClosed]);
      await owner.close();
      // Native gate release can precede result encoding and budget settlement.
      // Drain admitted replies too, rather than relying on checkpoint timing.
      await Promise.all(
        [...requestCompletions]
          .filter(([pendingId]) => pendingId !== id)
          .map(([, completion]) => completion),
      );
      return { value: undefined, transfers: [] };
    }
    case "gate": {
      port.postMessage({
        kind: "gate-entered",
        id,
        ...placement,
      } satisfies WorkerReply);
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
  validateBudgetGrant(request.command, request.budget, boot.budget, request.id);
  if (request.command.op === "close") {
    if (closingRequest !== undefined)
      throw new Error("Duplicate proof close command");
    closingRequest = request.id;
  }
  const done = Promise.withResolvers<void>();
  requestCompletions.set(request.id, done.promise);
  try {
    await receiveRequest(request);
  } finally {
    requestCompletions.delete(request.id);
    done.resolve();
  }
}

async function receiveRequest(request: WorkerRequest): Promise<void> {
  const control = isControlCommand(request.command);
  const cleanup = isCleanupCommand(request.command);
  const size = commandBytes(request.command);
  let releaseAdmission: (() => void) | undefined;
  let reply: WorkerReply;
  let transfers: ArrayBuffer[] = [];
  try {
    releaseAdmission = admission.reserve(
      cleanup
        ? "cleanup"
        : request.command.op === "close"
          ? "close"
          : control
            ? "control"
            : "ordinary",
      size,
    );
    const result = await execute(request.command, request.id);
    transfers = result.transfers;
    reply = {
      kind: "result",
      id: request.id,
      value: result.value,
      ...placement,
    };
  } catch (error) {
    if (request.command.op === "openRead")
      readTransfers.reject(request.command.grant, request.command.port, error);
    if (request.command.op === "openUpload")
      uploads.reject(request.command.grant, request.command.port, error);
    reply = {
      kind: owner.failed ? "owner-failed" : "error",
      id: request.id,
      error: serializeError(error),
      ...placement,
    };
  } finally {
    releaseAdmission?.();
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
