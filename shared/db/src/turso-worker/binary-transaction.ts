import { is, Placeholder } from "drizzle-orm";
import { LibSQLDatabase } from "drizzle-orm/libsql/driver-core";
import { LibSQLSession, LibSQLTransaction } from "drizzle-orm/libsql/session";
import {
  SQLiteAsyncDialect,
  type SQLiteTransactionConfig,
} from "drizzle-orm/sqlite-core";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  type ExtractTablesWithRelations,
  type RelationalSchemaConfig,
  type TablesRelationalConfig,
} from "drizzle-orm/relations";
import type { ResultSet, TransactionMode } from "@libsql/client";
import { boundStatementSchema, type StageClaim } from "./binary-protocol";
import type { WorkerTransaction, SqlWorkerDriver } from "./client";
import { SqlWorkerClient, SqlWorkerTransaction } from "./sql-client";
import type { BlobPlan, BlobFacts } from "./blob-protocol";

type EmptySchema = Record<string, never>;
type RunNested<
  F extends Record<string, unknown>,
  R extends TablesRelationalConfig,
> = <T>(
  body: (context: BinaryTransactionContext<F, R>) => Promise<T>,
) => Promise<T>;
export interface BinaryTransactionContext<
  F extends Record<string, unknown> = EmptySchema,
  R extends TablesRelationalConfig = EmptySchema,
> {
  db: LibSQLTransaction<F, R>;
  transaction: RunNested<F, R>;
  verifyBlob: (plan: BlobPlan) => Promise<BlobFacts>;
  executeBound: (
    query: { toSQL(): { sql: string; params: unknown[] } },
    bindings: ReadonlyMap<string, StageClaim>,
  ) => Promise<ResultSet>;
}

export interface WorkerBindingContext {
  readonly db: object;
  readonly executeBound: BinaryTransactionContext["executeBound"];
  readonly verifyBlob: BinaryTransactionContext["verifyBlob"];
}
export interface WorkerDatabaseBindings {
  claims(): StageClaim[];
  run<T>(
    context: WorkerBindingContext,
    operation: () => Promise<T>,
  ): Promise<T>;
}

// Public extension points only. Ordinary queries use real LibSQLSession mappers;
// all nested callbacks use typed savepoint capabilities, never raw control SQL.
class ScopedTransaction<
  F extends Record<string, unknown>,
  R extends TablesRelationalConfig,
> extends LibSQLTransaction<F, R> {
  private readonly nested: RunNested<F, R>;
  public constructor(
    dialect: SQLiteAsyncDialect,
    session: LibSQLSession<F, R>,
    schema: RelationalSchemaConfig<R> | undefined,
    nested: RunNested<F, R>,
  ) {
    super("async", dialect, session, schema);
    this.nested = nested;
  }
  public override transaction<T>(
    body: (transaction: LibSQLTransaction<F, R>) => Promise<T>,
  ): Promise<T> {
    return this.nested((context) => body(context.db));
  }
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
async function outcome<T>(operation: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error };
  }
}

async function scoped<
  T,
  F extends Record<string, unknown>,
  R extends TablesRelationalConfig,
>(
  driver: SqlWorkerDriver,
  client: SqlWorkerClient,
  lease: WorkerTransaction,
  schema: RelationalSchemaConfig<R> | undefined,
  body: (context: BinaryTransactionContext<F, R>) => Promise<T>,
  bindings?: WorkerDatabaseBindings,
): Promise<T> {
  let active = true;
  let child: Promise<unknown> | undefined;
  const assertLeaf = (): void => {
    if (!active || lease.closed) throw new Error("Transaction scope is closed");
    if (child)
      throw new Error("Parent transaction is suspended by a nested scope");
  };
  const dialect = new SQLiteAsyncDialect();
  const nested: RunNested<F, R> = async (callback) => {
    assertLeaf();
    const task = (async (): Promise<Awaited<ReturnType<typeof callback>>> => {
      const token = await lease.savepoint();
      const result = await outcome(() =>
        scoped(driver, client, lease, schema, callback, bindings),
      );
      // A rollback also releases its savepoint. Failure is terminal in the
      // owner; do not guess a second cleanup sequence on that connection.
      const settled = await outcome(() =>
        lease.finishSavepoint(token, result.ok ? "release" : "rollback"),
      );
      if (!settled.ok)
        throw new AggregateError(
          result.ok ? [settled.error] : [result.error, settled.error],
          "Savepoint finalization could not be confirmed",
          { cause: settled.error },
        );
      if (!result.ok) throw result.error;
      return await result.value;
    })();
    const completion = task.finally(() => {
      child = undefined;
    });
    child = completion;
    return completion;
  };
  const session = new LibSQLSession<F, R>(
    client,
    dialect,
    schema,
    {},
    new SqlWorkerTransaction(driver, lease, assertLeaf),
  );
  const db = new ScopedTransaction(dialect, session, schema, nested);
  const context: BinaryTransactionContext<F, R> = {
    db,
    transaction: nested,
    verifyBlob: async (plan): Promise<BlobFacts> => {
      assertLeaf();
      return lease.verifyBlob(plan);
    },
    executeBound: async (query, bindings): Promise<ResultSet> => {
      assertLeaf();
      const compiled = query.toSQL();
      const used = new Set<string>();
      const args = compiled.params.map((value: unknown) => {
        if (!is(value, Placeholder)) return { kind: "scalar", value };
        const claim = bindings.get(value.name);
        if (!claim) throw new Error("Missing resident placeholder binding");
        used.add(value.name);
        return { kind: "resident", claim };
      });
      if (used.size !== bindings.size)
        throw new Error("Unused resident placeholder binding");
      return lease.executeBound(
        boundStatementSchema.parse({ sql: compiled.sql, args }),
      );
    },
  };
  const result = await outcome(() =>
    bindings ? bindings.run(context, () => body(context)) : body(context),
  );
  const pending = child;
  const drained = await outcome(async () => {
    await pending;
  });
  active = false;
  if (!result.ok && !drained.ok)
    throw new AggregateError(
      [result.error, drained.error],
      "Transaction body and nested scope failed",
      { cause: result.error },
    );
  if (!result.ok) throw result.error;
  if (!drained.ok) throw drained.error;
  return result.value;
}

async function withTransaction<
  T,
  F extends Record<string, unknown>,
  R extends TablesRelationalConfig,
>(
  driver: SqlWorkerDriver,
  claims: StageClaim[],
  mode: TransactionMode,
  schema: RelationalSchemaConfig<R> | undefined,
  body: (context: BinaryTransactionContext<F, R>) => Promise<T>,
  bindings?: WorkerDatabaseBindings,
): Promise<T> {
  const lease = await driver.transaction(mode, claims);
  try {
    const result = await scoped(
      driver,
      new SqlWorkerClient(driver),
      lease,
      schema,
      body,
      bindings,
    );
    await lease.commit();
    return result;
  } catch (error) {
    try {
      await lease.rollback();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Binary transaction failed; rollback could not be confirmed",
        { cause: rollbackError },
      );
    }
    throw error;
  }
}
export function withBinaryTransaction<T>(
  driver: SqlWorkerDriver,
  claims: StageClaim[],
  body: (context: BinaryTransactionContext) => Promise<T>,
): Promise<T> {
  return withTransaction(driver, claims, "write", undefined, body);
}

export function createWorkerDatabase<F extends Record<string, unknown>>(
  driver: SqlWorkerDriver,
  schema: F,
  bindings?: WorkerDatabaseBindings,
): LibSQLDatabase<F> {
  type R = ExtractTablesWithRelations<F>;
  const dialect = new SQLiteAsyncDialect();
  const tables = extractTablesRelationalConfig<R>(
    schema,
    createTableRelationsHelpers,
  );
  const relationalSchema = {
    fullSchema: schema,
    schema: tables.tables,
    tableNamesMap: tables.tableNamesMap,
  };
  class Session extends LibSQLSession<F, R> {
    public override async transaction<T>(
      body: (db: LibSQLTransaction<F, R>) => T | Promise<T>,
      config?: SQLiteTransactionConfig,
    ): Promise<T> {
      if (config?.behavior === "exclusive")
        throw new Error(
          "Exclusive transaction config is not supported by the proof",
        );
      return withTransaction(
        driver,
        bindings?.claims() ?? [],
        config?.behavior === "immediate" ? "write" : "deferred",
        relationalSchema,
        async (context: BinaryTransactionContext<F, R>) => body(context.db),
        bindings,
      );
    }
  }
  const session = new Session(
    new SqlWorkerClient(driver),
    dialect,
    relationalSchema,
    {},
    undefined,
  );
  return new LibSQLDatabase<F>("async", dialect, session, relationalSchema);
}
