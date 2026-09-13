// Internal execution owner: no native imports, app policy or automatic recovery.
import type {
  InStatement,
  ResultSet,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import { assertOrdinarySql } from "./sql-admission";
import { NativeStatementUncertainError } from "./native-statement";
import type { NativeTransaction, OwnerBackend } from "./backend-contract";
import { verifyBlob, adoptBlob, type BlobSink } from "./blob-verification";
import type { BlobPlan, BlobFacts } from "./blob-protocol";

function admit(statement: InStatement): void {
  assertOrdinarySql(typeof statement === "string" ? statement : statement.sql);
}

export class OwnerUncertainError extends Error {
  public constructor(phase: string, cause: unknown) {
    super(`Persistence owner cannot be reused after ${phase}`, { cause });
    this.name = "OwnerUncertainError";
  }
}

export class ExecutionOwner {
  private readonly native: OwnerBackend;
  private tail: Promise<void> = Promise.resolve();
  private failure: OwnerUncertainError | undefined;
  private closing = false;
  private closeTask: Promise<void> | undefined;

  public constructor(native: OwnerBackend) {
    this.native = native;
  }
  public get failed(): boolean {
    return this.failure !== undefined;
  }
  public assertHealthy(): void {
    if (this.failure) throw this.failure;
  }
  public poison(phase: string, cause: unknown): OwnerUncertainError {
    this.failure ??= new OwnerUncertainError(phase, cause);
    return this.failure;
  }

  public requireState(expected: boolean, phase: string, cause?: unknown): void {
    this.assertHealthy();
    try {
      if (this.native.inTransaction() !== expected)
        throw new Error(
          `Expected native transaction state ${expected ? "active" : "inactive"}`,
        );
    } catch (error) {
      throw this.poison(
        phase,
        cause === undefined
          ? error
          : new AggregateError(
              [cause, error],
              "SQL failed and native transaction state is no longer valid",
              { cause },
            ),
      );
    }
  }
  public async checked<T>(
    expected: boolean,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.requireState(expected, "native state before statement");
    let result: T;
    try {
      result = await operation();
    } catch (error) {
      if (error instanceof NativeStatementUncertainError)
        throw this.poison("native statement cleanup", error);
      this.requireState(expected, "native state after failed statement", error);
      throw error;
    }
    this.requireState(expected, "native state after statement");
    return result;
  }

  private async acquire(closing = false): Promise<() => void> {
    this.assertHealthy();
    if (this.closing && !closing) throw new Error("Execution owner is closing");
    const previous = this.tail;
    const slot = Promise.withResolvers<void>();
    this.tail = slot.promise;
    await previous;
    try {
      // The native adapter may release its own queue before its failure reaches
      // us. No next command has entered that queue: we hold this separate gate.
      this.assertHealthy();
      return () => slot.resolve();
    } catch (error) {
      slot.resolve();
      throw error;
    }
  }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  }
  public async execute(statement: InStatement): Promise<ResultSet> {
    this.assertHealthy();
    admit(statement);
    return this.exclusive(() =>
      this.checked(false, () => this.native.execute(statement)),
    );
  }
  public async executeMultiple(sql: string): Promise<void> {
    this.assertHealthy();
    assertOrdinarySql(sql);
    return this.exclusive(() =>
      this.checked(false, () => this.native.executeMultiple(sql)),
    );
  }
  private async begin(mode: TransactionMode): Promise<NativeTransaction> {
    try {
      this.requireState(false, "native state before begin");
      const transaction = await this.native.transaction(mode);
      this.requireState(true, "native state after begin");
      return transaction;
    } catch (error) {
      throw this.poison("transaction begin", error);
    }
  }
  public async transaction(mode: TransactionMode): Promise<OwnedTransaction> {
    const release = await this.acquire();
    try {
      return new OwnedTransaction(this, await this.begin(mode), release);
    } catch (error) {
      release();
      throw error;
    }
  }

  private async atomic(
    statements: InStatement[],
    mode: TransactionMode,
  ): Promise<ResultSet[]> {
    const transaction = await this.begin(mode);
    const results: ResultSet[] = [];
    try {
      for (const statement of statements)
        results.push(
          ...(await this.checked(true, () => transaction.batch([statement]))),
        );
    } catch (error) {
      this.assertHealthy(); // An implicit rollback/state mismatch already poisoned the owner.
      try {
        this.requireState(true, "native state before batch rollback");
        await transaction.rollback();
        this.requireState(false, "native state after batch rollback");
      } catch (cleanupError) {
        throw this.poison(
          "batch rollback",
          new AggregateError(
            [error, cleanupError],
            "Batch failed and rollback could not be confirmed",
            { cause: error },
          ),
        );
      }
      throw error; // Acknowledged rollback: ordinary SQL failure stays local.
    }
    try {
      this.requireState(true, "native state before batch commit");
      await transaction.commit();
      this.requireState(false, "native state after batch commit");
    } catch (error) {
      throw this.poison("batch commit", error);
    }
    return results;
  }
  public async batch(
    statements: InStatement[],
    mode: TransactionMode,
  ): Promise<ResultSet[]> {
    this.assertHealthy();
    statements.forEach(admit);
    return this.exclusive(() => this.atomic(statements, mode));
  }
  private async foreignKeys(enabled: boolean): Promise<void> {
    await this.checked(false, async () => {
      await this.native.setForeignKeys(enabled);
      if ((await this.native.foreignKeysEnabled()) !== enabled)
        throw new Error("Foreign-key setting was not applied");
    });
  }
  public async migrate(statements: InStatement[]): Promise<ResultSet[]> {
    this.assertHealthy();
    statements.forEach(admit);
    return this.exclusive(async () => {
      try {
        await this.foreignKeys(false);
      } catch (error) {
        throw this.poison("migration foreign-key disable", error);
      }
      let outcome:
        { ok: true; results: ResultSet[] } | { ok: false; error: unknown };
      try {
        outcome = {
          ok: true,
          results: await this.atomic(statements, "deferred"),
        };
      } catch (error) {
        outcome = { ok: false, error };
      }
      // An uncertain transaction never runs another native cleanup command.
      this.assertHealthy();
      try {
        await this.foreignKeys(true);
      } catch (error) {
        throw this.poison(
          "migration foreign-key reset",
          outcome.ok
            ? error
            : new AggregateError(
                [outcome.error, error],
                "Migration failed and foreign-key reset could not be confirmed",
                { cause: outcome.error },
              ),
        );
      }
      if (!outcome.ok) throw outcome.error;
      return outcome.results;
    });
  }
  public close(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.closing = true;
    this.closeTask = this.finishClose();
    return this.closeTask;
  }
  private async finishClose(): Promise<void> {
    const release = await this.acquire(true);
    try {
      this.requireState(false, "native state before durable close");
      await this.native.close();
    } catch (error) {
      throw this.poison("durable close", error);
    } finally {
      release();
    }
  }
}

export class OwnedTransaction implements Transaction {
  private closing = false;
  private readonly savepoints: number[] = [];
  private lastSavepoint = 0;
  public get closed(): boolean {
    return this.closing || this.owner.failed;
  }
  private readonly owner: ExecutionOwner;
  private readonly native: NativeTransaction;
  private readonly release: () => void;
  private tail: Promise<void> = Promise.resolve();
  private finishing: Promise<void> | undefined;
  public constructor(
    owner: ExecutionOwner,
    native: NativeTransaction,
    release: () => void,
  ) {
    this.owner = owner;
    this.native = native;
    this.release = release;
  }
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.owner.assertHealthy();
    if (this.closed)
      return Promise.reject(new Error("Transaction lease is closed"));
    const result = this.tail.then(() => {
      this.owner.assertHealthy();
      return this.owner.checked(true, operation);
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  public adoptBlob(
    plan: BlobPlan,
    accept: (bytes: Uint8Array) => void,
    assertLive: () => void,
  ): Promise<BlobFacts> {
    return this.run(() =>
      adoptBlob(
        plan,
        (statement) => {
          admit(statement);
          return this.owner.checked(true, () => this.native.execute(statement));
        },
        accept,
        assertLive,
      ),
    );
  }
  public verifyBlob(plan: BlobPlan, sink?: BlobSink): Promise<BlobFacts> {
    // One tail entry owns the complete scan: same-lease statements and finalization
    // cannot slip between chunks and change the value being verified.
    return this.run(() =>
      verifyBlob(
        plan,
        (statement) => {
          admit(statement);
          return this.owner.checked(true, () => this.native.execute(statement));
        },
        sink,
      ),
    );
  }
  public async execute(statement: InStatement): Promise<ResultSet> {
    this.owner.assertHealthy();
    admit(statement);
    return this.run(() => this.native.execute(statement));
  }
  public async batch(statements: InStatement[]): Promise<ResultSet[]> {
    this.owner.assertHealthy();
    statements.forEach(admit);
    return this.run(async () => {
      const results: ResultSet[] = [];
      for (const statement of statements)
        results.push(
          ...(await this.owner.checked(true, () =>
            this.native.batch([statement]),
          )),
        );
      return results;
    });
  }
  public async executeMultiple(sql: string): Promise<void> {
    this.owner.assertHealthy();
    assertOrdinarySql(sql);
    return this.run(() => this.native.executeMultiple(sql));
  }
  public savepoint(
    action: "begin" | "rollback" | "release",
    id: number,
  ): Promise<void> {
    return this.run(async () => {
      if (!Number.isSafeInteger(id) || id < 1)
        throw new Error("Invalid savepoint identity");
      if (action === "begin") {
        if (this.savepoints.length >= 16)
          throw new Error("Savepoint depth limit exceeded");
        if (id <= this.lastSavepoint)
          throw new Error("Reused savepoint identity");
      } else if (this.savepoints.at(-1) !== id)
        throw new Error("Unknown, spent or non-leaf savepoint");
      try {
        await this.owner.checked(true, () => this.native.savepoint(action, id));
        if (action === "rollback")
          await this.owner.checked(true, () =>
            this.native.savepoint("release", id),
          );
      } catch (error) {
        throw this.owner.poison(`savepoint ${action}`, error);
      }
      if (action === "begin") {
        this.savepoints.push(id);
        this.lastSavepoint = id;
      } else this.savepoints.pop();
    });
  }
  public commit(): Promise<void> {
    return this.finish("commit");
  }
  public rollback(): Promise<void> {
    return this.finish("rollback");
  }
  public close(): void {
    void this.closeAsync().catch(() => undefined);
  }
  public closeAsync(): Promise<void> {
    return this.rollback();
  }
  private finish(action: "commit" | "rollback"): Promise<void> {
    if (this.finishing) return this.finishing;
    this.closing = true;
    this.finishing = this.finalize(action);
    return this.finishing;
  }
  private async finalize(action: "commit" | "rollback"): Promise<void> {
    try {
      await this.tail;
      this.owner.assertHealthy();
      const incomplete = action === "commit" && this.savepoints.length > 0;
      const effective = incomplete ? "rollback" : action;
      try {
        this.owner.requireState(true, `native state before ${effective}`);
        await this.native[effective]();
        this.owner.requireState(false, `native state after ${effective}`);
      } catch (error) {
        throw this.owner.poison(`transaction ${effective}`, error);
      }
      this.savepoints.length = 0;
      if (incomplete)
        throw new Error(
          "Cannot commit with open savepoints; transaction rolled back",
        );
    } finally {
      this.release();
    }
  }
}
