// Experimental proof only: runtime callers still use src/turso-client.ts.
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import type { ResultSet, Row, TransactionMode } from "@libsql/client";
import { BinaryScope } from "./binary-client";
import {
  validateBinaryReply,
  stageStatsSchema,
  type BinaryCommand,
  type BoundStatement,
  type StageClaim,
  type StageStats,
} from "./binary-protocol";
import {
  MAX_IN_FLIGHT,
  MAX_PENDING_BYTES,
  commandBytes,
  isCleanupCommand,
  parseBoot,
  parseCommand,
  parseLease,
  parseReply,
  parseResult,
  parseResults,
  snapshotCommand,
  type ProofCommand,
  type ProofPlacement,
  type ProofStatement,
} from "./protocol";

interface Pending {
  command: ProofCommand;
  bytes: number;
  control: boolean;
  cleanup: boolean;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  entered: (() => void) | undefined;
}

export interface ProofDriverOptions {
  url: string;
  /** Supplied explicitly by the package/launcher, never guessed from the cwd. */
  workerUrl: URL;
  maxInFlight?: number;
  maxPendingBytes?: number;
}

function resultSet(input: unknown): ResultSet {
  const result = parseResult(input);
  const rows = result.rows.map((values): Row => {
    const row: Row = { length: values.length };
    Object.defineProperty(row, "length", { enumerable: false });
    values.forEach((value, index) => {
      Object.defineProperty(row, index, { value });
      const column = result.columns[index];
      if (column !== undefined && !Object.hasOwn(row, column))
        Object.defineProperty(row, column, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
    });
    return row;
  });
  return {
    ...result,
    rows,
    lastInsertRowid: result.lastInsertRowid,
    toJSON: (): unknown => ({
      ...result,
      rows,
      lastInsertRowid: result.lastInsertRowid?.toString(),
    }),
  };
}

export class ProofTransaction {
  public readonly id: string;
  private closing = false;
  private readonly ownerFailed: () => boolean;
  public get closed(): boolean {
    return this.closing || this.ownerFailed();
  }
  private readonly executeStatement: (
    statement: ProofStatement,
  ) => Promise<ResultSet>;
  private readonly executeResident: (
    statement: BoundStatement,
  ) => Promise<ResultSet>;
  private readonly finalize: (action: "commit" | "rollback") => Promise<void>;
  private finishing: Promise<void> | undefined;

  public constructor(
    id: string,
    execute: (statement: ProofStatement) => Promise<ResultSet>,
    finalize: (action: "commit" | "rollback") => Promise<void>,
    executeResident: (statement: BoundStatement) => Promise<ResultSet>,
    ownerFailed: () => boolean,
  ) {
    this.id = id;
    this.executeStatement = execute;
    this.finalize = finalize;
    this.executeResident = executeResident;
    this.ownerFailed = ownerFailed;
  }
  public executeBound(statement: BoundStatement): Promise<ResultSet> {
    if (this.closed)
      return Promise.reject(new Error("Transaction lease is closed"));
    return this.executeResident(statement);
  }
  public execute(statement: ProofStatement): Promise<ResultSet> {
    if (this.closed)
      return Promise.reject(new Error("Transaction lease is closed"));
    return this.executeStatement(statement);
  }
  public commit(): Promise<void> {
    return this.finish("commit");
  }
  public rollback(): Promise<void> {
    return this.finish("rollback");
  }
  private finish(action: "commit" | "rollback"): Promise<void> {
    if (this.finishing) return this.finishing;
    this.closing = true;
    this.finishing = this.finalize(action);
    return this.finishing;
  }
}

export class TursoThreadProof {
  private readonly worker: Worker;
  private readonly generation = randomUUID();
  private readonly ready = Promise.withResolvers<ProofPlacement>();
  private readonly exited = Promise.withResolvers<number>();
  private readonly pending = new Map<number, Pending>();
  private readonly maxInFlight: number;
  private readonly maxPendingBytes: number;
  private pendingBytes = 0;
  private ordinary = 0;
  private controls = 0;
  private cleanupRequests = 0;
  private nextId = 0;
  private placement: ProofPlacement | undefined;
  private failure: Error | undefined;
  private closing = false;
  private closeAcknowledged = false;
  private closeTask: Promise<void> | undefined;

  public constructor(options: ProofDriverOptions) {
    if (process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"] === "1")
      throw new Error("Local SQLite opens are forbidden in this process");
    const boot = parseBoot({ url: options.url, generation: this.generation });
    this.maxInFlight = options.maxInFlight ?? MAX_IN_FLIGHT;
    this.maxPendingBytes = options.maxPendingBytes ?? MAX_PENDING_BYTES;
    if (
      !Number.isSafeInteger(this.maxInFlight) ||
      this.maxInFlight < 1 ||
      this.maxInFlight > MAX_IN_FLIGHT ||
      !Number.isSafeInteger(this.maxPendingBytes) ||
      this.maxPendingBytes < 256 ||
      this.maxPendingBytes > MAX_PENDING_BYTES
    )
      throw new Error("Invalid proof driver admission limits");
    // Failed startup is observable via initialize/requests/close, even when the
    // owner fails before the caller has attached its first promise handler.
    void this.ready.promise.catch(() => undefined);
    void this.exited.promise.catch(() => undefined);
    this.worker = new Worker(options.workerUrl, { workerData: boot });
    this.worker.on("message", (input: unknown) => this.receive(input));
    this.worker.on("error", (error) => this.fail(error));
    this.worker.on("exit", (code) => {
      this.exited.resolve(code);
      if (!this.closeAcknowledged || code !== 0 || this.pending.size > 0)
        this.fail(
          new Error(
            `Persistence thread exited without a successful durable close (code ${code}); admitted writes may have committed`,
          ),
        );
    });
  }

  public initialize(): Promise<ProofPlacement> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closing)
      return Promise.reject(new Error("Proof driver is closing"));
    return this.ready.promise;
  }

  public async execute(
    statement: ProofStatement,
    lease?: string,
  ): Promise<ResultSet> {
    return resultSet(
      await this.request({
        op: "execute",
        statement,
        ...(lease !== undefined && { lease }),
      }),
    );
  }

  public get closed(): boolean {
    return this.closing || this.failure !== undefined;
  }
  public async batch(
    statements: ProofStatement[],
    mode: TransactionMode = "deferred",
    lease?: string,
  ): Promise<ResultSet[]> {
    return parseResults(
      await this.request({
        op: "batch",
        statements,
        mode,
        ...(lease !== undefined && { lease }),
      }),
    ).map(resultSet);
  }
  public async migrate(statements: ProofStatement[]): Promise<ResultSet[]> {
    return parseResults(await this.request({ op: "migrate", statements })).map(
      resultSet,
    );
  }
  public async executeMultiple(sql: string, lease?: string): Promise<void> {
    await this.request({
      op: "script",
      sql,
      ...(lease !== undefined && { lease }),
    });
  }
  public binary(command: BinaryCommand): Promise<unknown> {
    return this.request({ op: "binary", command });
  }
  public async openBinaryScope(): Promise<BinaryScope> {
    const id = parseLease(await this.binary({ action: "openScope" }));
    return new BinaryScope(this, id);
  }
  public async stageStats(): Promise<StageStats> {
    return stageStatsSchema.parse(await this.binary({ action: "stats" }));
  }
  public async transaction(
    mode: TransactionMode = "write",
    claims: StageClaim[] = [],
  ): Promise<ProofTransaction> {
    const lease = parseLease(await this.request({ op: "begin", mode, claims }));
    return new ProofTransaction(
      lease,
      (statement) => this.execute(statement, lease),
      async (action): Promise<void> => {
        await this.request({ op: "finish", lease, action });
      },
      async (statement): Promise<ResultSet> =>
        resultSet(await this.request({ op: "executeBound", lease, statement })),
      () => this.failure !== undefined,
    );
  }

  public holdThreadForProof(state: SharedArrayBuffer): {
    entered: Promise<void>;
    done: Promise<void>;
  } {
    const entered = Promise.withResolvers<void>();
    const done = this.request({ op: "gate", state }, () =>
      entered.resolve(),
    ).then(() => undefined);
    void done.catch((error: unknown) => entered.reject(error));
    return { entered: entered.promise, done };
  }

  public terminateForProof(): Promise<number> {
    return this.worker.terminate();
  }

  public close(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.closing = true; // Fence new ordinary admissions before any await.
    this.closeTask = this.finishClose();
    return this.closeTask;
  }

  private async finishClose(): Promise<void> {
    let closeError: unknown;
    try {
      await this.request({ op: "close" });
    } catch (error) {
      closeError = error;
    }
    await this.exited.promise;
    if (closeError !== undefined) throw closeError;
    if (this.failure) throw this.failure;
    if (!this.closeAcknowledged)
      throw new Error("Missing durable close acknowledgement");
  }

  private request(input: ProofCommand, entered?: () => void): Promise<unknown> {
    try {
      if (this.failure) throw this.failure;
      if (this.closeAcknowledged) throw new Error("Proof driver is closed");
      const command = parseCommand(input);
      const cleanup = isCleanupCommand(command);
      const control = command.op === "finish" || command.op === "close";
      if (
        this.closing &&
        !control &&
        !(
          (command.op === "execute" ||
            command.op === "batch" ||
            command.op === "script") &&
          command.lease !== undefined
        ) &&
        command.op !== "executeBound"
      )
        throw new Error("Proof driver is closing");
      const bytes = commandBytes(command);
      // Finalization has reserved slots: a full queue waiting behind a lease
      // must never prevent that lease from committing/rolling back or closing.
      if (
        cleanup
          ? this.cleanupRequests >= 2
          : control
            ? command.op !== "close" && this.controls >= 2
            : this.ordinary >= this.maxInFlight ||
              this.pendingBytes + bytes > this.maxPendingBytes
      )
        throw new Error("Proof driver overloaded");
      const outgoing = snapshotCommand(command);
      const id = ++this.nextId;
      return new Promise<unknown>((resolve, reject) => {
        const pending: Pending = {
          command: outgoing,
          bytes,
          control,
          cleanup,
          resolve,
          reject,
          entered,
        };
        this.pending.set(id, pending);
        if (cleanup) this.cleanupRequests++;
        else if (control) this.controls++;
        else {
          this.ordinary++;
          this.pendingBytes += bytes;
        }
        // Input buffers are cloned, not detached. This proof deliberately caps
        // messages at 64 KiB; bulk staging/owned bindings remain separate work.
        void this.ready.promise
          .then(() => {
            if (this.pending.has(id))
              this.worker.postMessage({
                id,
                generation: this.generation,
                command: outgoing,
              });
          })
          .catch((error: unknown) => {
            if (this.pending.has(id)) {
              this.release(id, pending);
              reject(error);
            }
          });
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private receive(input: unknown): void {
    if (this.failure) return; // Terminal: never accept late success or restart.
    try {
      const reply = parseReply(input);
      if (
        reply.generation !== this.generation ||
        reply.pid !== process.pid ||
        (this.placement && reply.threadId !== this.placement.threadId)
      )
        throw new Error("Persistence thread identity mismatch");
      if (reply.kind === "ready") {
        if (this.placement)
          throw new Error("Duplicate persistence thread handshake");
        if (reply.threadId !== this.worker.threadId)
          throw new Error("Handshake did not identify the spawned thread");
        this.placement = reply;
        this.ready.resolve(reply);
        return;
      }
      if (!this.placement)
        throw new Error("Persistence reply preceded handshake");
      const pending = this.pending.get(reply.id);
      if (!pending) throw new Error("Unknown or stale persistence reply");
      if (reply.kind === "gate-entered") {
        pending.entered?.();
        return;
      }
      if (reply.kind === "owner-failed") {
        const error = new Error(reply.error.message);
        error.name = reply.error.name;
        throw error; // Poison all pending work, then terminate and join the owner.
      }
      if (reply.kind === "result") {
        if (
          pending.command.op === "execute" ||
          pending.command.op === "executeBound"
        )
          parseResult(reply.value);
        else if (
          pending.command.op === "batch" ||
          pending.command.op === "migrate"
        )
          parseResults(reply.value);
        else if (pending.command.op === "begin") parseLease(reply.value);
        else if (pending.command.op === "binary")
          validateBinaryReply(pending.command.command, reply.value);
        else if (reply.value !== undefined)
          throw new Error("Invalid persistence acknowledgement");
      }
      this.release(reply.id, pending);
      if (reply.kind === "error") {
        const error = new Error(reply.error.message);
        error.name = reply.error.name;
        if (reply.error.code !== undefined)
          Object.defineProperty(error, "code", { value: reply.error.code });
        pending.reject(error);
      } else {
        if (pending.command.op === "close") this.closeAcknowledged = true;
        pending.resolve(reply.value);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
      void this.worker
        .terminate()
        .catch((terminationError: unknown) =>
          this.exited.reject(terminationError),
        );
    }
  }

  private release(id: number, pending: Pending): void {
    this.pending.delete(id);
    if (pending.cleanup) this.cleanupRequests--;
    else if (pending.control) this.controls--;
    else {
      this.ordinary--;
      this.pendingBytes -= pending.bytes;
    }
  }

  private fail(error: Error): void {
    if (!this.failure) {
      this.failure = new Error(
        `Persistence owner lost: ${error.message}; admitted writes may have committed`,
        { cause: error },
      );
      this.failure.name = "PersistenceOwnerLostError";
    }
    this.ready.reject(this.failure);
    for (const [id, pending] of this.pending) {
      this.release(id, pending);
      pending.reject(this.failure);
    }
  }
}
