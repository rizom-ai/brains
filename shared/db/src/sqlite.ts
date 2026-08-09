import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createTursoClient } from "./turso-client";

export type SqliteDatabase = LibSQLDatabase<Record<string, unknown>>;
export type SqliteEngine = "libsql" | "turso";

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
  /** Explicit engine selection; overrides `BRAINS_DB_ENGINE`. */
  engine?: SqliteEngine | undefined;
}

export interface SqliteConnection {
  db: SqliteDatabase;
  client: Client;
  url: string;
  engine: SqliteEngine;
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

/** Resolve the selected engine. Turso's embedded adapter only supports files. */
function resolveSqliteEngine(
  url: string,
  requestedEngine?: SqliteEngine,
): SqliteEngine {
  if (requestedEngine === "turso" && !url.startsWith("file:")) {
    throw new Error("The Turso embedded engine only supports file: urls");
  }
  if (requestedEngine !== undefined) return requestedEngine;
  return process.env["BRAINS_DB_ENGINE"] === "turso" && url.startsWith("file:")
    ? "turso"
    : "libsql";
}

/**
 * Create a SQLite-backed drizzle database using the selected engine.
 *
 * Every shell service database is built this way; the per-service parts are
 * the url, the drizzle schema, and which env var holds the auth token.
 */
export function createSqliteDatabase(
  options: CreateSqliteDatabaseOptions,
): SqliteConnection {
  const { url, schema } = options;
  const authToken = resolveAuthToken(options);

  const engine = resolveSqliteEngine(url, options.engine);
  const client =
    engine === "turso"
      ? createTursoClient({ url })
      : authToken
        ? createClient({ url, authToken })
        : createClient({ url });

  return { db: drizzle(client, { schema }), client, url, engine };
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

  await client.execute("PRAGMA busy_timeout = 5000");
  await client.execute("PRAGMA journal_mode = WAL");
}
