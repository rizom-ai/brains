import type { Database } from "@tursodatabase/database";
import { localDatabasePath } from "./local-file-url";
import type {
  Client,
  InArgs,
  InStatement,
  ResultSet,
  Row,
  Transaction,
  TransactionMode,
} from "@libsql/client";

export interface CreateTursoClientOptions {
  /** Database url — `file:` local path or `file::memory:`. */
  url: string;
}

interface NormalizedStatement {
  sql: string;
  args: InArgs | undefined;
}

/**
 * Rows must be hybrid array-like objects: drizzle slices them positionally
 * (`Array.prototype.slice.call(row)`) while application code reads named
 * columns, and `normalizeRow` keeps only enumerable properties. Mirror the
 * libSQL client exactly: indices and `length` non-enumerable, names enumerable.
 */
function buildRow(values: unknown[], columns: string[]): Row {
  const row = {};
  Object.defineProperty(row, "length", { value: values.length });
  values.forEach((value, i) => {
    Object.defineProperty(row, i, { value });
    const column = columns[i];
    if (column !== undefined && !Object.hasOwn(row, column)) {
      Object.defineProperty(row, column, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  });
  return row as Row;
}

function buildResultSet(options: {
  columns: string[];
  columnTypes: string[];
  rows: Row[];
  rowsAffected: number;
  lastInsertRowid: bigint | undefined;
}): ResultSet {
  return {
    ...options,
    toJSON: (): unknown => ({
      columns: options.columns,
      columnTypes: options.columnTypes,
      rows: options.rows,
      rowsAffected: options.rowsAffected,
      lastInsertRowid: options.lastInsertRowid?.toString(),
    }),
  };
}

const EMPTY_RESULT: Omit<Parameters<typeof buildResultSet>[0], "rowsAffected"> =
  {
    columns: [],
    columnTypes: [],
    rows: [],
    lastInsertRowid: undefined,
  };

function normalizeStatement(
  stmt: InStatement | string,
  args?: InArgs,
): NormalizedStatement {
  if (typeof stmt === "string") return { sql: stmt, args };
  return { sql: stmt.sql, args: stmt.args };
}

const BEGIN_BY_MODE: Record<TransactionMode, string> = {
  write: "BEGIN IMMEDIATE",
  read: "BEGIN",
  deferred: "BEGIN DEFERRED",
};

/**
 * A libSQL-`Client`-compatible adapter over `@tursodatabase/database`.
 *
 * The Turso SDK connects asynchronously while `createSqliteDatabase` is
 * synchronous, so the connection is opened lazily and every method awaits it.
 * All statements share one connection; the SDK serializes them internally.
 */
class TursoClient implements Client {
  public closed = false;
  public readonly protocol = "file";
  private readonly connection: Promise<Database>;
  private readonly fileBacked: boolean;
  private operationTail: Promise<void> = Promise.resolve();
  private closePromise: Promise<void> | null = null;

  constructor(url: string) {
    const path = localDatabasePath(url);
    this.fileBacked = path !== ":memory:";
    // The web-owner boundary guarantees one local opener, so enabling
    // multiprocess_wal would only permit callers to bypass that invariant.
    // dynamic import: the SDK loads a native binding at import time, which
    // must not happen for consumers that never select the turso engine
    this.connection = import("@tursodatabase/database").then(({ connect }) =>
      connect(path),
    );
    // a failed lazy connect surfaces when a method awaits it; without this,
    // an unused client would turn it into an unhandled rejection
    this.connection.catch(() => undefined);
  }

  async execute(stmt: InStatement): Promise<ResultSet>;
  async execute(sql: string, args?: InArgs): Promise<ResultSet>;
  async execute(
    stmtOrSql: InStatement | string,
    args?: InArgs,
  ): Promise<ResultSet> {
    return this.runExclusive(async () => {
      const db = await this.open();
      return this.executeOn(db, normalizeStatement(stmtOrSql, args));
    });
  }

  async batch(
    stmts: Array<InStatement | [string, InArgs?]>,
    mode: TransactionMode = "deferred",
  ): Promise<Array<ResultSet>> {
    return this.runExclusive(async () => {
      const db = await this.open();
      return this.batchOn(db, stmts, mode);
    });
  }

  async migrate(stmts: Array<InStatement>): Promise<Array<ResultSet>> {
    return this.runExclusive(async () => {
      const db = await this.open();
      await db.exec("PRAGMA foreign_keys=off");
      try {
        return await this.batchOn(db, stmts, "deferred");
      } finally {
        await db.exec("PRAGMA foreign_keys=on").catch(() => undefined);
      }
    });
  }

  async transaction(mode: TransactionMode = "deferred"): Promise<Transaction> {
    const release = await this.acquireOperation();
    try {
      const db = await this.open();
      await db.exec(BEGIN_BY_MODE[mode]);
      return new TursoTransaction(
        db,
        (stmt) => this.executeOn(db, stmt),
        release,
      );
    } catch (error) {
      release();
      throw error;
    }
  }

  async executeMultiple(sql: string): Promise<void> {
    await this.runExclusive(async () => {
      const db = await this.open();
      await db.exec(sql);
    });
  }

  async sync(): Promise<never> {
    throw new Error("sync() is not supported by the turso file client");
  }

  reconnect(): void {
    throw new Error("reconnect() is not supported by the turso file client");
  }

  close(): void {
    void this.closeAsync().catch(() => undefined);
  }

  /** Await all admitted operations and the native handle's durable close. */
  closeAsync(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    // Fence new admissions synchronously, but let operations that already
    // joined the serial tail finish before the native handle closes.
    this.closed = true;
    const admittedOperations = this.operationTail;
    this.closePromise = admittedOperations.then(async () => {
      const db = await this.connection;
      try {
        if (this.fileBacked) {
          await db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        }
      } finally {
        await db.close();
      }
    });
    return this.closePromise;
  }

  private async batchOn(
    db: Database,
    stmts: Array<InStatement | [string, InArgs?]>,
    mode: TransactionMode,
  ): Promise<Array<ResultSet>> {
    await db.exec(BEGIN_BY_MODE[mode]);
    try {
      const results: ResultSet[] = [];
      for (const stmt of stmts) {
        const normalized = Array.isArray(stmt)
          ? normalizeStatement(stmt[0], stmt[1])
          : normalizeStatement(stmt);
        results.push(await this.executeOn(db, normalized));
      }
      await db.exec("COMMIT");
      return results;
    } catch (error) {
      await db.exec("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  private async acquireOperation(): Promise<() => void> {
    if (this.closed) {
      throw new Error("CLIENT_CLOSED: the client was closed");
    }
    const previous = this.operationTail;
    let release = (): void => undefined;
    this.operationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }

  private async runExclusive<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const release = await this.acquireOperation();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private open(): Promise<Database> {
    return this.connection;
  }

  private async executeOn(
    db: Database,
    stmt: NormalizedStatement,
  ): Promise<ResultSet> {
    const { sql, args } = stmt;
    const prepared = await db.prepare(sql);
    const columns = prepared.columns().map((column) => column.name);

    if (columns.length === 0) {
      const info =
        args === undefined ? await prepared.run() : await prepared.run(args);
      return buildResultSet({
        ...EMPTY_RESULT,
        rowsAffected: info.changes,
        lastInsertRowid: BigInt(info.lastInsertRowid),
      });
    }

    const rawStatement = prepared.raw(true);
    const rawRows = (
      args === undefined
        ? await rawStatement.all()
        : await rawStatement.all(args)
    ) as unknown[][];
    return buildResultSet({
      columns,
      columnTypes: columns.map(() => ""),
      rows: rawRows.map((values) => buildRow(values, columns)),
      rowsAffected: 0,
      lastInsertRowid: undefined,
    });
  }
}

class TursoTransaction implements Transaction {
  public closed = false;
  private readonly db: Database;
  private readonly executeStatement: (
    stmt: NormalizedStatement,
  ) => Promise<ResultSet>;
  private readonly releaseOperation: () => void;

  constructor(
    db: Database,
    executeStatement: (stmt: NormalizedStatement) => Promise<ResultSet>,
    releaseOperation: () => void,
  ) {
    this.db = db;
    this.executeStatement = executeStatement;
    this.releaseOperation = releaseOperation;
  }

  async execute(stmt: InStatement): Promise<ResultSet>;
  async execute(sql: string, args?: InArgs): Promise<ResultSet>;
  async execute(
    stmtOrSql: InStatement | string,
    args?: InArgs,
  ): Promise<ResultSet> {
    return this.executeStatement(normalizeStatement(stmtOrSql, args));
  }

  async batch(stmts: Array<InStatement>): Promise<Array<ResultSet>> {
    const results: ResultSet[] = [];
    for (const stmt of stmts) {
      results.push(await this.executeStatement(normalizeStatement(stmt)));
    }
    return results;
  }

  async executeMultiple(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async commit(): Promise<void> {
    await this.finish("COMMIT");
  }

  async rollback(): Promise<void> {
    await this.finish("ROLLBACK");
  }

  close(): void {
    if (!this.closed) void this.rollback().catch(() => undefined);
  }

  private async finish(statement: "COMMIT" | "ROLLBACK"): Promise<void> {
    if (this.closed) return;
    try {
      await this.db.exec(statement);
      this.closed = true;
    } catch (error) {
      if (statement === "COMMIT") {
        await this.db.exec("ROLLBACK").catch(() => undefined);
      }
      this.closed = true;
      throw error;
    } finally {
      this.releaseOperation();
    }
  }
}

/**
 * Create a libSQL-`Client`-compatible client backed by the Turso database
 * engine. Only `file:` urls are supported — remote urls stay on `@libsql/client`.
 */
export function createTursoClient(options: CreateTursoClientOptions): Client {
  return new TursoClient(options.url);
}

interface AsyncCloseClient extends Client {
  closeAsync(): Promise<void>;
}

/** Await a local checkpoint and durable close across SQLite client engines. */
export function closeSqliteClient(client: Client): Promise<void> {
  const closeAsync = (client as Partial<AsyncCloseClient>).closeAsync;
  if (typeof closeAsync === "function") return closeAsync.call(client);

  if (client.protocol !== "file") {
    client.close();
    return Promise.resolve();
  }

  // The local libSQL client executes this statement synchronously before
  // returning its promise. Close in the same turn to preserve Client.close()
  // semantics while still surfacing checkpoint failures to async owners.
  let checkpoint: Promise<ResultSet>;
  try {
    checkpoint = client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (error) {
    client.close();
    return Promise.reject(error);
  }
  client.close();
  return checkpoint.then(() => undefined);
}
