// Test-only contract adapter. Imports libSQL types, never its runtime client.
import type {
  Client,
  InArgs,
  InStatement,
  ResultSet,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import { LibSQLDatabase } from "drizzle-orm/libsql/driver-core";
import { LibSQLSession } from "drizzle-orm/libsql/session";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  type ExtractTablesWithRelations,
} from "drizzle-orm/relations";
import { parseStatement, type ProofStatement } from "./protocol";
import type { ProofTransaction, TursoThreadProof } from "./client";

function statement(input: InStatement, args?: InArgs): ProofStatement {
  return parseStatement(
    typeof input === "string"
      ? { sql: input, ...(args !== undefined && { args }) }
      : input,
  );
}
function statements(
  inputs: Array<InStatement | [string, InArgs?]>,
): ProofStatement[] {
  if (inputs.length > 16)
    throw new Error("Proof driver batch statement limit exceeded");
  return inputs.map((input) =>
    Array.isArray(input) ? statement(input[0], input[1]) : statement(input),
  );
}

export class ProofLibsqlTransaction implements Transaction {
  private readonly driver: TursoThreadProof;
  private readonly lease: ProofTransaction;
  private readonly guard: () => void;
  public constructor(
    driver: TursoThreadProof,
    lease: ProofTransaction,
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

export class ProofLibsqlClient implements Client {
  public readonly protocol = "file";
  private readonly driver: TursoThreadProof;
  public constructor(driver: TursoThreadProof) {
    this.driver = driver;
  }
  public get closed(): boolean {
    return this.driver.closed;
  }
  public execute(input: InStatement): Promise<ResultSet>;
  public execute(sql: string, args?: InArgs): Promise<ResultSet>;
  public async execute(input: InStatement, args?: InArgs): Promise<ResultSet> {
    return this.driver.execute(statement(input, args));
  }
  public async batch(
    inputs: Array<InStatement | [string, InArgs?]>,
    mode: TransactionMode = "deferred",
  ): Promise<ResultSet[]> {
    return this.driver.batch(statements(inputs), mode);
  }
  public async migrate(inputs: InStatement[]): Promise<ResultSet[]> {
    return this.driver.migrate(statements(inputs));
  }
  public async transaction(
    mode: TransactionMode = "deferred",
  ): Promise<ProofLibsqlTransaction> {
    return new ProofLibsqlTransaction(
      this.driver,
      await this.driver.transaction(mode),
    );
  }
  public executeMultiple(sql: string): Promise<void> {
    return this.driver.executeMultiple(sql);
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
    return this.driver.close();
  }
}

export function createProofDatabase<TSchema extends Record<string, unknown>>(
  client: ProofLibsqlClient,
  schema: TSchema,
): LibSQLDatabase<TSchema> {
  const dialect = new SQLiteAsyncDialect();
  const tables = extractTablesRelationalConfig<
    ExtractTablesWithRelations<TSchema>
  >(schema, createTableRelationsHelpers);
  const relationalSchema = {
    fullSchema: schema,
    schema: tables.tables,
    tableNamesMap: tables.tableNamesMap,
  };
  const session = new LibSQLSession<
    TSchema,
    ExtractTablesWithRelations<TSchema>
  >(client, dialect, relationalSchema, {}, undefined);
  return new LibSQLDatabase<TSchema>(
    "async",
    dialect,
    session,
    relationalSchema,
  );
}
