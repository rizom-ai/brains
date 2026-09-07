// Isolated proof controller: no native imports, app policy or automatic recovery.
import type {
  InStatement,
  ResultSet,
  Transaction,
  TransactionMode,
} from "@libsql/client";

export interface OwnerBackend {
  execute: (statement: InStatement) => Promise<ResultSet>;
  executeMultiple: (sql: string) => Promise<void>;
  transaction: (mode: TransactionMode) => Promise<Transaction>;
  setForeignKeys: (enabled: boolean) => Promise<void>;
  foreignKeysEnabled: () => Promise<boolean>;
  close: () => Promise<void>;
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
  public execute(statement: InStatement): Promise<ResultSet> {
    return this.exclusive(() => this.native.execute(statement));
  }
  public executeMultiple(sql: string): Promise<void> {
    return this.exclusive(() => this.native.executeMultiple(sql));
  }
  private async begin(mode: TransactionMode): Promise<Transaction> {
    try {
      return await this.native.transaction(mode);
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
    let results: ResultSet[];
    try {
      results = await transaction.batch(statements);
    } catch (error) {
      try {
        await transaction.rollback();
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
      await transaction.commit();
    } catch (error) {
      throw this.poison("batch commit", error);
    }
    return results;
  }
  public batch(
    statements: InStatement[],
    mode: TransactionMode,
  ): Promise<ResultSet[]> {
    return this.exclusive(() => this.atomic(statements, mode));
  }
  private async foreignKeys(enabled: boolean): Promise<void> {
    await this.native.setForeignKeys(enabled);
    if ((await this.native.foreignKeysEnabled()) !== enabled)
      throw new Error("Foreign-key setting was not applied");
  }
  public migrate(statements: InStatement[]): Promise<ResultSet[]> {
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
  public get closed(): boolean {
    return this.closing || this.owner.failed;
  }
  private readonly owner: ExecutionOwner;
  private readonly native: Transaction;
  private readonly release: () => void;
  private tail: Promise<void> = Promise.resolve();
  private finishing: Promise<void> | undefined;
  public constructor(
    owner: ExecutionOwner,
    native: Transaction,
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
      return operation();
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  public execute(statement: InStatement): Promise<ResultSet> {
    return this.run(() => this.native.execute(statement));
  }
  public batch(statements: InStatement[]): Promise<ResultSet[]> {
    return this.run(() => this.native.batch(statements));
  }
  public executeMultiple(sql: string): Promise<void> {
    return this.run(() => this.native.executeMultiple(sql));
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
      try {
        await this.native[action]();
      } catch (error) {
        throw this.owner.poison(`transaction ${action}`, error);
      }
    } finally {
      this.release();
    }
  }
}
