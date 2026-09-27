// Internal Client-compatible facade. Imports libSQL types, never its runtime client.
import type {
  Client,
  InArgs,
  InStatement,
  ResultSet,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import {
  MAX_SQL_MIGRATION_STATEMENTS,
  MAX_SQL_BATCH_STATEMENTS,
  parseStatement,
  type SqlStatement,
} from "./client-protocol";
import type { SqlWorkerLease, SqlWorkerTransport } from "./client-transport";

function statement(input: InStatement, args?: InArgs): SqlStatement {
  return parseStatement(
    typeof input === "string"
      ? { sql: input, ...(args !== undefined && { args }) }
      : input,
  );
}
function statements(
  inputs: Array<InStatement | [string, InArgs?]>,
): SqlStatement[] {
  if (inputs.length > MAX_SQL_BATCH_STATEMENTS)
    throw new Error("Proof driver batch statement limit exceeded");
  return inputs.map((input) =>
    Array.isArray(input) ? statement(input[0], input[1]) : statement(input),
  );
}

export class SqlWorkerTransaction implements Transaction {
  private readonly driver: SqlWorkerTransport;
  private readonly lease: SqlWorkerLease;
  private readonly guard: () => void;
  public constructor(
    driver: SqlWorkerTransport,
    lease: SqlWorkerLease,
    guard: () => void = () => undefined,
  ) {
    this.driver = driver;
    this.lease = lease;
    this.guard = guard;
  }
  public get closed(): boolean {
    return this.lease.closed;
  }
  private assertOpen(): void {
    this.guard();
    if (this.closed) throw new Error("Transaction lease is closed");
  }
  public async execute(input: InStatement): Promise<ResultSet> {
    this.assertOpen();
    return this.lease.execute(statement(input));
  }
  public async batch(inputs: InStatement[]): Promise<ResultSet[]> {
    this.assertOpen();
    return this.driver.batch(statements(inputs), "deferred", this.lease.id);
  }
  public async executeMultiple(sql: string): Promise<void> {
    this.assertOpen();
    await this.driver.executeMultiple(sql, this.lease.id);
  }
  public commit(): Promise<void> {
    return this.lease.commit();
  }
  public rollback(): Promise<void> {
    return this.lease.rollback();
  }
  public close(): void {
    if (this.closed) return;
    // The void Client contract observes rejection here; closeAsync remains the
    // required observable completion path and joins the same finalization.
    void this.closeAsync().catch(() => undefined);
  }
  public closeAsync(): Promise<void> {
    return this.lease.rollback();
  }
}

export class SqlWorkerClient implements Client {
  public readonly protocol = "file";
  private readonly driver: SqlWorkerTransport;
  private closing: Promise<void> | undefined;
  private readonly beforeClose: (() => Promise<void>) | undefined;
  public constructor(
    driver: SqlWorkerTransport,
    beforeClose?: () => Promise<void>,
  ) {
    this.driver = driver;
    this.beforeClose = beforeClose;
  }
  public get closed(): boolean {
    return this.closing !== undefined || this.driver.closed;
  }
  private assertOpen(): void {
    if (this.closed) throw new Error("SQL worker driver is closed");
  }
  public execute(input: InStatement): Promise<ResultSet>;
  public execute(sql: string, args?: InArgs): Promise<ResultSet>;
  public async execute(input: InStatement, args?: InArgs): Promise<ResultSet> {
    this.assertOpen();
    return this.driver.execute(statement(input, args));
  }
  public async batch(
    inputs: Array<InStatement | [string, InArgs?]>,
    mode: TransactionMode = "deferred",
  ): Promise<ResultSet[]> {
    this.assertOpen();
    return this.driver.batch(statements(inputs), mode);
  }
  public migrate(inputs: InStatement[]): Promise<ResultSet[]> {
    try {
      this.assertOpen();
      if (inputs.length > MAX_SQL_MIGRATION_STATEMENTS)
        throw new Error("Migration statement limit exceeded");
      return this.driver.migrateProgram(
        inputs.map((input) => statement(input)),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
  public async transaction(
    mode: TransactionMode = "deferred",
  ): Promise<SqlWorkerTransaction> {
    this.assertOpen();
    return new SqlWorkerTransaction(
      this.driver,
      await this.driver.transaction(mode),
    );
  }
  public async executeMultiple(sql: string): Promise<void> {
    this.assertOpen();
    await this.driver.executeMultiple(sql);
  }
  public async sync(): Promise<never> {
    throw new Error("sync() is not supported by the Turso file client");
  }
  public reconnect(): never {
    throw new Error("reconnect() is not supported by the Turso file client");
  }
  public close(): void {
    // closeAsync exposes the original durable-close rejection to the owner.
    void this.closeAsync().catch(() => undefined);
  }
  public closeAsync(): Promise<void> {
    if (this.closing) return this.closing;
    if (!this.beforeClose) return (this.closing = this.driver.close());
    // Fence the client synchronously, then retire its binary plane before SQL.
    this.closing = Promise.resolve().then(async (): Promise<void> => {
      const errors: unknown[] = [];
      try {
        await this.beforeClose?.();
      } catch (error) {
        errors.push(error);
      }
      try {
        await this.driver.close();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(
          errors,
          "Database binary and worker retirement failed",
          { cause: errors[0] },
        );
    });
    return this.closing;
  }
}
