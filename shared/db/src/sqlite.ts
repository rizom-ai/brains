import { createClient, type Client } from "@libsql/client";
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
    ? createClient({ url, authToken })
    : createClient({ url });

  return { db: drizzle(client, { schema }), client, url };
}

/**
 * Enable WAL journaling and a busy timeout so concurrent readers and writers
 * wait instead of failing with SQLITE_BUSY. Only meaningful for local files —
 * remote libSQL manages its own concurrency.
 */
export async function applySqlitePragmas(
  client: PragmaClient,
  url: string,
): Promise<void> {
  if (!url.startsWith("file:")) return;

  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA busy_timeout = 5000");
}
