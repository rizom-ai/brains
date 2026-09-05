import { LibSQLDatabase } from "drizzle-orm/libsql/driver-core";
import { LibSQLSession } from "drizzle-orm/libsql/session";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  type ExtractTablesWithRelations,
} from "drizzle-orm/relations";
import { createTursoClient } from "./turso-client";
import { isLocalFileDatabaseUrl } from "./local-file-url";

export type SqliteDatabase<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> = LibSQLDatabase<TSchema>;

const forbidLocalDatabaseOpenEnv = "BRAINS_FORBID_LOCAL_DATABASE_OPEN";

export interface PragmaClient {
  execute: (statement: string) => Promise<unknown>;
}

export interface CreateSqliteDatabaseOptions<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Local Turso database URL. Remote databases are not supported. */
  url: string;
  schema: TSchema;
}

export interface SqliteConnection<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> {
  db: SqliteDatabase<TSchema>;
  client: ReturnType<typeof createTursoClient>;
  url: string;
}

/**
 * Open the sole supported runtime engine. Compose Drizzle's public session and
 * database classes: its URL-based entrypoint imports a libSQL runtime client
 * even when a custom client is supplied.
 */
export function createSqliteDatabase<TSchema extends Record<string, unknown>>(
  options: CreateSqliteDatabaseOptions<TSchema>,
): SqliteConnection<TSchema> {
  const { url, schema } = options;
  if (!isLocalFileDatabaseUrl(url)) {
    throw new Error("The Turso runtime only supports file: database URLs");
  }
  if (process.env[forbidLocalDatabaseOpenEnv] === "1") {
    throw new Error(`Local SQLite opens are forbidden in this process: ${url}`);
  }
  const client = createTursoClient({ url });
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
  const db = new LibSQLDatabase<TSchema>(
    "async",
    dialect,
    session,
    relationalSchema,
  );
  return { db, client, url };
}

/** Enable WAL on the single-owner Turso connection. */
export async function applySqlitePragmas(
  client: PragmaClient,
  url: string,
): Promise<void> {
  if (!isLocalFileDatabaseUrl(url)) {
    throw new Error("The Turso runtime only supports file: database URLs");
  }
  await client.execute("PRAGMA journal_mode = WAL");
}
