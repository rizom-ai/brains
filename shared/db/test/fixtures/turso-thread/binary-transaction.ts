import { is, Placeholder } from "drizzle-orm";
import { LibSQLSession, LibSQLTransaction } from "drizzle-orm/libsql/session";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import type { ResultSet } from "@libsql/client";
import { boundStatementSchema, type StageClaim } from "./binary-protocol";
import type { ProofTransaction, TursoThreadProof } from "./client";
import { ProofLibsqlClient, ProofLibsqlTransaction } from "./libsql-client";

type EmptySchema = Record<string, never>;
type TransactionDb = LibSQLTransaction<EmptySchema, EmptySchema>;
type RunNested = <T>(
  body: (context: BinaryTransactionContext) => Promise<T>,
) => Promise<T>;

export interface BinaryTransactionContext {
  db: TransactionDb;
  transaction: RunNested;
  executeBound: (
    query: { toSQL(): { sql: string; params: unknown[] } },
    bindings: ReadonlyMap<string, StageClaim>,
  ) => Promise<ResultSet>;
}

// Public override only: all queries still use LibSQLSession's real mappers.
// This routes ordinary db.transaction callbacks through the same scoped factory
// as binary callbacks, so escaped nested facades cannot use the parent's lease.
class ScopedTransaction extends LibSQLTransaction<EmptySchema, EmptySchema> {
  private readonly nested: RunNested;
  public constructor(
    dialect: SQLiteAsyncDialect,
    session: LibSQLSession<EmptySchema, EmptySchema>,
    depth: number,
    nested: RunNested,
  ) {
    super("async", dialect, session, undefined, depth);
    this.nested = nested;
  }
  public override transaction<T>(
    body: (transaction: TransactionDb) => Promise<T>,
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

async function scoped<T>(
  driver: TursoThreadProof,
  client: ProofLibsqlClient,
  lease: ProofTransaction,
  depth: number,
  body: (context: BinaryTransactionContext) => Promise<T>,
): Promise<T> {
  let active = true;
  let child: Promise<unknown> | undefined;
  const assertAlive = (): void => {
    if (!active || lease.closed) throw new Error("Transaction scope is closed");
  };
  const assertLeaf = (): void => {
    assertAlive();
    if (child)
      throw new Error("Parent transaction is suspended by a nested scope");
  };
  const dialect = new SQLiteAsyncDialect();
  // Separate public facades use the SAME native lease. The lifecycle facade
  // can release/roll back a savepoint while ordinary parent work is suspended.
  const lifecycleSession = new LibSQLSession<EmptySchema, EmptySchema>(
    client,
    dialect,
    undefined,
    {},
    new ProofLibsqlTransaction(driver, lease, assertAlive),
  );
  const lifecycle = new LibSQLTransaction<EmptySchema, EmptySchema>(
    "async",
    dialect,
    lifecycleSession,
    undefined,
    depth,
  );
  const nested: RunNested = async (callback) => {
    assertLeaf();
    const task = lifecycle.transaction(async () =>
      scoped(driver, client, lease, depth + 1, callback),
    );
    const completion = task.finally(() => {
      child = undefined;
    });
    child = completion;
    return completion;
  };
  const session = new LibSQLSession<EmptySchema, EmptySchema>(
    client,
    dialect,
    undefined,
    {},
    new ProofLibsqlTransaction(driver, lease, assertLeaf),
  );
  const db = new ScopedTransaction(dialect, session, depth, nested);
  const context: BinaryTransactionContext = {
    db,
    transaction: nested,
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
  const result = await outcome(() => body(context));
  // An admitted nested callback must finish before its parent's finalization,
  // even if the body returns/throws before awaiting that callback.
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

/** Real LibSQLSession query mapping plus Drizzle's own savepoint implementation. */
export async function withBinaryTransaction<T>(
  driver: TursoThreadProof,
  claims: StageClaim[],
  body: (context: BinaryTransactionContext) => Promise<T>,
): Promise<T> {
  const lease = await driver.transaction("write", claims);
  try {
    const result = await scoped(
      driver,
      new ProofLibsqlClient(driver),
      lease,
      0,
      body,
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
