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

/** Create a client whose refused local BEGIN cannot poison a later commit. */
export function createSqliteClient(config: Config): Client {
  const client = createClient({
    ...config,
    ...(config.url.startsWith("file:") ? { timeout: 0 } : {}),
  });
  if (config.url.startsWith("file:")) {
    const begin = client.transaction.bind(client);
    client.transaction = async (
      mode?: TransactionMode,
    ): Promise<Transaction> => {
      try {
        return await begin(mode);
      } catch (error) {
        if (
          error instanceof LibsqlError &&
          /^SQLITE_(?:BUSY|LOCKED)$/u.test(error.code)
        ) {
          // libSQL 0.17 retains a failed BEGIN statement until native cleanup.
          // This connection has not acquired a transaction; no callback or
          // commit can be replayed. Reopen before any caller retries acquisition.
          // The SDK declares void, but its local reconnect returns a Promise.
          await Promise.resolve(client.reconnect());
        }
        throw error;
      }
    };
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
 * Callers retry asynchronously; libSQL's reopened connections also default to 0.
 * Only meaningful for local files — remote libSQL manages its own concurrency.
 */
export async function applySqlitePragmas(
  client: PragmaClient,
  url: string,
): Promise<void> {
  if (!url.startsWith("file:")) return;

  await client.execute("PRAGMA busy_timeout = 0");
  await client.execute("PRAGMA journal_mode = WAL");
}
