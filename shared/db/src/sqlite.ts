import {
  createClient,
  LibsqlError,
  type Client,
  type Config,
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

const ACQUISITION_RETRY_BUDGET_MS = 2_000;
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
  },
): Promise<T> {
  const deadline = Date.now() + ACQUISITION_RETRY_BUDGET_MS;
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

/** Retry definitely refused local BEGINs, never transaction bodies or commits. */
export function createSqliteClient(config: Config): Client {
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
    client.transaction = (mode?: TransactionMode): Promise<Transaction> =>
      retryContention(() => begin(mode), {
        isClosed,
        // libSQL 0.17 retains a refused BEGIN statement until native cleanup.
        // No transaction was acquired; existing transaction objects remain
        // untouched. Reopen before retrying, even when the budget is exhausted.
        // The SDK declares void, but its local reconnect returns a Promise.
        afterRefusal: async () => {
          await Promise.resolve(client.reconnect());
        },
      });
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

  const client = authToken
    ? createSqliteClient({ url, authToken })
    : createSqliteClient({ url });

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
