// Experimental proof only: runtime callers still use src/turso-client.ts.
import type { Worker } from "node:worker_threads";
import { spawnSqlWorker } from "../../../src/turso-worker/spawn-worker";
import { WorkerLifetime } from "../../../src/turso-worker/worker-lifetime";
import { ReplyIdentity } from "../../../src/turso-worker/reply-identity";
import { PendingRequests } from "../../../src/turso-worker/pending-requests";
import { CommandAdmission } from "../../../src/turso-worker/command-admission";
import { parseBoot } from "../../../src/turso-worker/boot-protocol";
import { randomUUID } from "node:crypto";
import type { ResultSet, TransactionMode } from "@libsql/client";
import { resultSet, resultSets } from "../../../src/turso-worker/result-codec";
import {
  parseResult,
  parseResults,
} from "../../../src/turso-worker/result-protocol";
import { BinaryScope } from "./binary-client";
import { BinaryTransferClient } from "./transfer-client";
import { ReadScope } from "./read-client";
import {
  validateReadReply,
  readStatsSchema,
  type ReadStats,
  type ReadCommand,
} from "./read-protocol";
import { MigrationPrograms } from "./migration-client";
import { deserializeError } from "../../../src/turso-worker/error-protocol";
import { ProofBudgetPool, type BudgetMember } from "./budget-pool";
import { budgetRequirement, type BudgetGrant } from "./budget-protocol";
import {
  blobFactsSchema,
  type BlobFacts,
  type BlobPlan,
} from "../../../src/turso-worker/blob-protocol";
import {
  savepointTokenSchema,
  type SavepointCommand,
  type SavepointToken,
} from "./savepoint-protocol";
import {
  validateBinaryReply,
  stageStatsSchema,
  type BinaryCommand,
  type BoundStatement,
  type StageClaim,
  type StageCapability,
  type SealedStage,
  type StageStats,
} from "./binary-protocol";
import {
  MAX_MIGRATION_STATEMENTS,
  migrationTokenSchema,
  type MigrationCommand,
  commandBytes,
  isCleanupCommand,
  isControlCommand,
  parseCommand,
  parseLease,
  parseReply,
  snapshotCommand,
  type ProofCommand,
  type ProofPlacement,
  type ProofStatement,
} from "./protocol";

interface Pending {
  command: ProofCommand;
  releaseAdmission: () => void;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  entered: (() => void) | undefined;
  budget: BudgetGrant | undefined;
}

export interface ProofDriverOptions {
  url: string;
  /** Supplied explicitly by the package/launcher, never guessed from the cwd. */
  workerUrl: URL;
  maxInFlight?: number;
  maxPendingBytes?: number;
  budget?: ProofBudgetPool;
}

export class ProofTransaction {
  public readonly id: string;
  private closing = false;
  private readonly ownerFailed: () => boolean;
  private readonly control: (command: SavepointCommand) => Promise<unknown>;
  private readonly verify: (plan: BlobPlan) => Promise<BlobFacts>;
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
    control: (command: SavepointCommand) => Promise<unknown>,
    verify: (plan: BlobPlan) => Promise<BlobFacts>,
  ) {
    this.id = id;
    this.executeStatement = execute;
    this.finalize = finalize;
    this.executeResident = executeResident;
    this.ownerFailed = ownerFailed;
    this.control = control;
    this.verify = verify;
  }
  public verifyBlob(plan: BlobPlan): Promise<BlobFacts> {
    if (this.closed)
      return Promise.reject(new Error("Transaction lease is closed"));
    return this.verify(plan);
  }
  public async savepoint(): Promise<SavepointToken> {
    if (this.closed) throw new Error("Transaction lease is closed");
    return savepointTokenSchema.parse(
      await this.control({ action: "begin", lease: this.id }),
    );
  }
  public async finishSavepoint(
    token: SavepointToken,
    action: "release" | "rollback",
  ): Promise<void> {
    if (this.closed) throw new Error("Transaction lease is closed");
    await this.control({ action, lease: this.id, token });
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
  private readonly uploads: BinaryTransferClient;
  private readonly downloads: BinaryTransferClient;
  private readonly budgetMember: BudgetMember;
  private readonly generation = randomUUID();
  private readonly identity = new ReplyIdentity(this.generation, process.pid);
  private readonly ready = Promise.withResolvers<ProofPlacement>();
  private readonly lifetime: WorkerLifetime;
  private readonly pending = new PendingRequests<Pending>();
  private readonly migrationPrograms = new MigrationPrograms(this);
  private readonly admission: CommandAdmission;
  private nextId = 0;
  private failure: Error | undefined;
  private closing = false;
  private closeAcknowledged = false;
  private closeTask: Promise<void> | undefined;

  public constructor(options: ProofDriverOptions) {
    if (process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"] === "1")
      throw new Error("Local SQLite opens are forbidden in this process");
    const pool = options.budget ?? new ProofBudgetPool();
    const boot = parseBoot({
      url: options.url,
      generation: this.generation,
      budget: pool.id,
    });
    this.admission = new CommandAdmission({
      role: "sender",
      maxInFlight: options.maxInFlight,
      maxPendingBytes: options.maxPendingBytes,
    });
    // Failed startup is observable via initialize/requests/close, even when the
    // owner fails before the caller has attached its first promise handler.
    void this.ready.promise.catch(() => undefined);
    const spawned = spawnSqlWorker({
      workerUrl: options.workerUrl,
      boot,
      admit: (): BudgetMember => pool.admit(),
    });
    this.budgetMember = spawned.reservation;
    this.worker = spawned.worker;
    this.budgetMember.bind(this.worker);
    this.lifetime = new WorkerLifetime(this.worker, {
      message: (input): void => this.receive(input),
      failure: (error): void => this.fail(error),
      exit: (code): void => {
        if (!this.closeAcknowledged || code !== 0 || this.pending.size > 0)
          this.fail(
            new Error(
              `Persistence thread exited without a successful durable close (code ${code}); admitted writes may have committed`,
            ),
          );
      },
    });
    this.uploads = new BinaryTransferClient(
      this.worker,
      this.lifetime.exited,
      pool,
      "upload",
      (grant, port, handoff) =>
        this.request(
          { op: "openUpload", grant, port },
          undefined,
          handoff,
        ).then(() => undefined),
      (id) => this.cancelTransfer("upload", id),
    );
    this.downloads = new BinaryTransferClient(
      this.worker,
      this.lifetime.exited,
      pool,
      "read",
      (grant, port, handoff) =>
        this.request({ op: "openRead", grant, port }, undefined, handoff).then(
          () => undefined,
        ),
      (id) => this.cancelTransfer("read", id),
    );
  }

  private cancelTransfer(
    direction: "upload" | "read",
    id: string,
  ): Promise<void> {
    // An admitted durable close already revokes every data channel. Do not queue
    // cleanup behind it or await close(), which itself drains these transfers.
    if (this.closing) return Promise.resolve();
    return this.request({ op: "cancelTransfer", direction, id }).then(
      () => undefined,
    );
  }

  public upload(
    stage: StageCapability,
    spawn: () => Worker,
    signal?: AbortSignal,
  ): Promise<SealedStage> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closing)
      return Promise.reject(new Error("Proof driver is closing"));
    return this.uploads.run(stage, spawn, signal);
  }

  public read(command: ReadCommand): Promise<unknown> {
    return this.request({ op: "read", command });
  }
  public async openReadScope(): Promise<ReadScope> {
    return new ReadScope(
      this,
      parseLease(await this.read({ action: "openScope" })),
    );
  }
  public async readStats(): Promise<ReadStats> {
    return readStatsSchema.parse(await this.read({ action: "stats" }));
  }
  public download(
    capability: StageCapability,
    spawn: () => Worker,
    signal?: AbortSignal,
  ): Promise<SealedStage> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closing)
      return Promise.reject(new Error("Proof driver is closing"));
    return this.downloads.run(capability, spawn, signal);
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
  public migrateProgram(statements: ProofStatement[]): Promise<ResultSet[]> {
    return this.migrationPrograms.execute(statements).then(resultSets);
  }
  public migration(command: MigrationCommand): Promise<unknown> {
    return this.request({ op: "migration", command });
  }
  public async verifyBlob(plan: BlobPlan, lease?: string): Promise<BlobFacts> {
    return blobFactsSchema.parse(
      await this.request({
        op: "verifyBlob",
        plan,
        ...(lease !== undefined && { lease }),
      }),
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
      (command) => this.request({ op: "savepoint", command }),
      (plan) => this.verifyBlob(plan, lease),
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
    try {
      await this.lifetime.exited;
    } catch (joinError) {
      closeError =
        closeError !== undefined
          ? new AggregateError(
              [closeError, joinError],
              "Persistence close failed; worker exit could not be confirmed",
              { cause: joinError },
            )
          : joinError;
    }
    try {
      const results = await Promise.allSettled([
        this.uploads.drain(),
        this.downloads.drain(),
      ]);
      const errors: unknown[] = [];
      for (const result of results)
        if (result.status === "rejected") errors.push(result.reason);
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(errors, "Binary transfer shutdown failures");
    } catch (uploadError) {
      if (closeError !== undefined)
        throw new AggregateError(
          [closeError, uploadError],
          "Persistence and binary shutdown failed",
          { cause: uploadError },
        );
      throw uploadError;
    }
    if (closeError !== undefined) throw closeError;
    if (this.failure) throw this.failure;
    if (!this.closeAcknowledged)
      throw new Error("Missing durable close acknowledgement");
  }

  private request(
    input: ProofCommand,
    entered?: () => void,
    handoff?: () => boolean,
  ): Promise<unknown> {
    let unregisteredAdmission: (() => void) | undefined;
    try {
      if (this.failure) throw this.failure;
      if (this.closeAcknowledged) throw new Error("Proof driver is closed");
      const command = parseCommand(input);
      const cleanup = isCleanupCommand(command);
      const control = isControlCommand(command);
      if (
        this.closing &&
        !control &&
        !(
          (command.op === "execute" ||
            command.op === "batch" ||
            command.op === "script" ||
            command.op === "verifyBlob") &&
          command.lease !== undefined
        ) &&
        command.op !== "executeBound"
      )
        throw new Error("Proof driver is closing");
      const bytes = commandBytes(command);
      // Finalization has reserved slots: a full queue waiting behind a lease
      // must never prevent that lease from committing/rolling back or closing.
      const releaseAdmission = this.admission.reserve(
        cleanup
          ? "cleanup"
          : command.op === "close"
            ? "close"
            : control
              ? "control"
              : "ordinary",
        bytes,
      );
      unregisteredAdmission = releaseAdmission;
      const outgoing = snapshotCommand(command);
      const id = ++this.nextId;
      const required = budgetRequirement(outgoing);
      const budget = required
        ? this.budgetMember.reserve(id, required)
        : undefined;
      const waiting = Promise.withResolvers<unknown>();
      const pending: Pending = {
        command: outgoing,
        releaseAdmission,
        resolve: waiting.resolve,
        reject: waiting.reject,
        entered,
        budget,
      };
      this.pending.register(id, pending);
      unregisteredAdmission = undefined; // Pending reply/failure now owns retirement.
      // Ordinary input buffers remain borrowed snapshots. Direct uploads hand
      // off only a port here; their payloads never enter this control channel.
      void this.ready.promise
        .then(() => {
          if (this.pending.has(id)) {
            if (handoff?.() === false) {
              // Explicitly cancelled BEFORE posting: no receiver ownership was created.
              this.release(id, pending);
              pending.reject(
                new Error("Binary handoff cancelled before dispatch"),
              );
              return;
            }
            // After this point a failed handoff requires receiver settlement/join.
            this.worker.postMessage(
              {
                id,
                generation: this.generation,
                command: outgoing,
                ...(budget && { budget }),
              },
              outgoing.op === "openUpload" || outgoing.op === "openRead"
                ? [outgoing.port]
                : [],
            );
          }
        })
        .catch((error: unknown) => {
          if (this.pending.has(id)) {
            // Submission failure is not proof that a reserved allocation was
            // never used. Fence and join rather than reclaiming optimistically.
            this.fail(
              error instanceof Error ? error : new Error(String(error)),
            );
            this.lifetime.requestTermination();
          }
        });
      return waiting.promise;
    } catch (error) {
      unregisteredAdmission?.(); // Snapshot/budget rejection before pending registration.
      return Promise.reject(error);
    }
  }

  private receive(input: unknown): void {
    if (this.failure) return; // Terminal: never accept late success or restart.
    try {
      const reply = parseReply(input);
      this.identity.accept(reply, reply.kind === "ready", this.worker.threadId);
      if (reply.kind === "ready") {
        this.ready.resolve(reply);
        return;
      }
      if (reply.kind === "read-closed") {
        this.downloads.settle(reply.id, reply.result);
        return;
      }
      if (reply.kind === "upload-closed") {
        this.uploads.settle(reply.id, reply.result);
        return;
      }
      if (reply.kind === "budget-release") {
        this.budgetMember.release(reply.id, "resident");
        return;
      }
      const pending = this.pending.require(reply.id);
      if (reply.kind === "gate-entered") {
        pending.entered?.();
        return;
      }
      if (reply.kind === "owner-failed") {
        throw deserializeError(reply.error); // Poison all pending work, then terminate and join the owner.
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
        else if (pending.command.op === "migration") {
          const command = pending.command.command;
          if (command.action === "reserve") {
            const token = migrationTokenSchema.parse(reply.value);
            if (token.generation !== this.generation || token.id !== reply.id)
              throw new Error("Invalid migration acknowledgement");
          } else if (command.action === "run") {
            const results = parseResults(reply.value, MAX_MIGRATION_STATEMENTS);
            if (results.length !== command.count)
              throw new Error("Invalid migration result count");
          } else if (reply.value !== undefined)
            throw new Error("Invalid migration acknowledgement");
        } else if (pending.command.op === "verifyBlob")
          blobFactsSchema.parse(reply.value);
        else if (pending.command.op === "begin") parseLease(reply.value);
        else if (
          pending.command.op === "openUpload" &&
          reply.value !== undefined
        )
          throw new Error("Invalid direct upload acknowledgement");
        else if (
          pending.command.op === "savepoint" &&
          pending.command.command.action === "begin"
        ) {
          const token = savepointTokenSchema.parse(reply.value);
          if (
            token.generation !== this.generation ||
            token.lease !== pending.command.command.lease ||
            token.id !== reply.id
          )
            throw new Error("Invalid savepoint acknowledgement");
        } else if (pending.command.op === "binary")
          validateBinaryReply(pending.command.command, reply.value);
        else if (pending.command.op === "read")
          validateReadReply(
            pending.command.command,
            reply.value,
            this.generation,
            reply.id,
          );
        else if (reply.value !== undefined)
          throw new Error("Invalid persistence acknowledgement");
      }
      const responseError =
        reply.kind === "error" ? deserializeError(reply.error) : undefined;
      if (
        pending.budget &&
        (pending.budget.kind === "scratch" || reply.kind === "error")
      )
        this.budgetMember.release(reply.id, pending.budget.kind);
      this.release(reply.id, pending);
      if (responseError !== undefined) {
        pending.reject(responseError);
      } else if (reply.kind === "result") {
        if (pending.command.op === "close") this.closeAcknowledged = true;
        pending.resolve(reply.value);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
      this.lifetime.requestTermination();
    }
  }

  private release(id: number, pending: Pending): void {
    this.pending.retire(id, pending);
  }

  private fail(error: Error): void {
    this.budgetMember.fence(); // Reservations survive rejection until worker exit.
    if (!this.failure) {
      this.failure = new Error(
        `Persistence owner lost: ${error.message}; admitted writes may have committed`,
        { cause: error },
      );
      this.failure.name = "PersistenceOwnerLostError";
    }
    this.uploads.fail(this.failure);
    this.downloads.fail(this.failure);
    this.ready.reject(this.failure);
    this.pending.rejectAll(this.failure);
  }
}
