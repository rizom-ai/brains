import {
  createClient,
  LibsqlError,
  type Client,
  type Config,
  type InArgs,
  type InStatement,
  type ResultSet,
  type TransactionMode,
  type Transaction,
} from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

export type SqliteDatabase = LibSQLDatabase<Record<string, unknown>>;

/** The subset of the libSQL client the pragma helper needs. */
export interface PragmaClient {
  execute: (statement: string) => Promise<unknown>;
  readonly closed?: boolean;
}

export interface CreateSqliteDatabaseOptions {
  /** Database url — `file:` for local SQLite, `libsql:` for remote. */
  url: string;
  /** Drizzle schema tables for this database. */
  schema: Record<string, unknown>;
  /** Explicit auth token; wins over `authTokenEnv`. */
  authToken?: string | undefined;
  /** Environment variable consulted when no explicit token is given. */
  authTokenEnv?: string | undefined;
  /** See {@link SqliteClientOptions.contentionRetryBudgetMs}. */
  contentionRetryBudgetMs?: number | undefined;
}

export interface SqliteClientOptions {
  /**
   * How long a local client keeps retrying a refused write; defaults to the
   * native busy timeout it replaced. 0 surfaces the first refusal, for an
   * owner that runs its own bounded retry and must be its only one.
   */
  contentionRetryBudgetMs?: number | undefined;
}

export interface SqliteConnection {
  db: SqliteDatabase;
  client: Client;
  url: string;
}

/**
 * Resolve the auth token from an explicit value, else the named env var.
 */
export function resolveAuthToken(options: {
  authToken?: string | undefined;
  authTokenEnv?: string | undefined;
}): string | undefined {
  if (options.authToken !== undefined) return options.authToken;
  if (options.authTokenEnv === undefined) return undefined;
  return process.env[options.authTokenEnv];
}

// As long as the native busy timeout this replaced, so no write gives up sooner.
const CONTENTION_RETRY_BUDGET_MS = 5_000;
const ACQUISITION_RETRY_BASE_DELAY_MS = 5;
const ACQUISITION_RETRY_MAX_DELAY_MS = 40;

/** A statement the database refused because another connection held a lock. */
function isContention(error: unknown): error is LibsqlError {
  return (
    error instanceof LibsqlError && /^SQLITE_(?:BUSY|LOCKED)$/u.test(error.code)
  );
}

/**
 * Run a local statement, retrying it asynchronously with jittered backoff
 * while the database refuses it for contention, within one budget. Only for
 * statements that are safe to repeat when refused: a refusal applied nothing.
 */
async function retryContention<T>(
  run: () => Promise<T>,
  options: {
    isClosed: () => boolean;
    /** Runs after every refusal, before the budget is checked. */
    afterRefusal?: () => Promise<void>;
    budgetMs?: number | undefined;
  },
): Promise<T> {
  const deadline =
    Date.now() + (options.budgetMs ?? CONTENTION_RETRY_BUDGET_MS);
  const attemptRun = async (attempt: number): Promise<T> => {
    if (options.isClosed())
      throw new LibsqlError("The client is closed", "CLIENT_CLOSED");
    try {
      return await run();
    } catch (error) {
      if (options.isClosed() || !isContention(error)) throw error;
      await options.afterRefusal?.();
      const backoff = Math.min(
        ACQUISITION_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
        ACQUISITION_RETRY_MAX_DELAY_MS,
      );
      const delay = backoff / 2 + Math.random() * (backoff / 2);
      if (options.isClosed() || Date.now() + delay >= deadline) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      if (options.isClosed() || Date.now() >= deadline) throw error;
      return attemptRun(attempt + 1);
    }
  };
  return attemptRun(1);
}

/**
 * A local client that never waits on a lock natively: busy waiting blocks the
 * application thread. Every entry point that can need a write lock instead
 * retries a refusal asynchronously under one policy: single statements
 * (`execute`), batches and migrations, which a refusal leaves unapplied, and
 * transaction acquisition. Statements inside an open transaction and
 * multi-statement scripts are never retried; a refusal there can follow
 * applied work.
 */
export function createSqliteClient(
  config: Config,
  options: SqliteClientOptions = {},
): Client {
  const client = createClient({
    ...config,
    ...(config.url.startsWith("file:") ? { timeout: 0 } : {}),
  });
  // A file-backed embedded replica also has remote transaction/sync state.
  // Leave its acquisition and reconnect ownership with the SDK: the local-file
  // refusal cleanup below is not established safe for replication.
  if (config.url.startsWith("file:") && config.syncUrl === undefined) {
    const begin = client.transaction.bind(client);
    const isClosed = (): boolean => client.closed;
    const budgetMs = options.contentionRetryBudgetMs;
    const rawExecute = client.execute.bind(client);
    const rawBatch = client.batch.bind(client);
    const rawMigrate = client.migrate.bind(client);
    // libSQL 0.17 retains a refused statement until native cleanup. A refused
    // BEGIN leaves the connection refusing every later commit; a refused
    // standalone write leaves it inside a transaction that is never committed,
    // so later writes look applied to this connection alone and vanish when it
    // is reopened. Every refusal therefore reopens the connection, even when
    // the budget is exhausted. Existing transaction objects own their
    // connections and remain untouched. The SDK declares void, but its local
    // reconnect returns a Promise.
    const reopening = {
      isClosed,
      budgetMs,
      afterRefusal: async (): Promise<void> => {
        await Promise.resolve(client.reconnect());
      },
    };
    // A standalone statement, a batch and a migration each run atomically,
    // so a refused one applied nothing and is safe to run again.
    function execute(stmt: InStatement): Promise<ResultSet>;
    function execute(sql: string, args?: InArgs): Promise<ResultSet>;
    function execute(
      stmtOrSql: InStatement | string,
      args?: InArgs,
    ): Promise<ResultSet> {
      return retryContention(
        () =>
          typeof stmtOrSql === "string"
            ? rawExecute(stmtOrSql, args)
            : rawExecute(stmtOrSql),
        reopening,
      );
    }
    client.execute = execute;
    client.batch = (
      stmts: Parameters<Client["batch"]>[0],
      mode?: TransactionMode,
    ): Promise<ResultSet[]> =>
      retryContention(() => rawBatch(stmts, mode), reopening);
    client.migrate = (stmts: InStatement[]): Promise<ResultSet[]> =>
      retryContention(() => rawMigrate(stmts), reopening);
    client.transaction = (mode?: TransactionMode): Promise<Transaction> =>
      retryContention(() => begin(mode), reopening);
  }
  return client;
}

/**
 * Create a libSQL-backed drizzle database.
 *
 * Every shell service database is built this way; the per-service parts are
 * the url, the drizzle schema, and which env var holds the auth token.
 */
export function createSqliteDatabase(
  options: CreateSqliteDatabaseOptions,
): SqliteConnection {
  const { url, schema } = options;
  const authToken = resolveAuthToken(options);

  const clientOptions = {
    contentionRetryBudgetMs: options.contentionRetryBudgetMs,
  };
  const client = authToken
    ? createSqliteClient({ url, authToken }, clientOptions)
    : createSqliteClient({ url }, clientOptions);

  return { db: drizzle(client, { schema }), client, url };
}

/**
 * Enable WAL and fail fast on lock contention. Native busy waiting blocks the
 * application thread, preventing an in-process lock holder from continuing.
 * Entering WAL needs an exclusive lock, so a refusal is retried here
 * asynchronously, like a refused BEGIN; libSQL's reopened connections also
 * default to 0. Only meaningful for local files — remote libSQL manages its
 * own concurrency.
 */
export async function applySqlitePragmas(
  client: PragmaClient,
  url: string,
): Promise<void> {
  if (!url.startsWith("file:")) return;

  const isClosed = (): boolean => client.closed === true;
  for (const pragma of ["PRAGMA busy_timeout = 0", "PRAGMA journal_mode = WAL"])
    await retryContention(() => client.execute(pragma), { isClosed });
}
