import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql/driver-core";
import type { BinaryPersistence } from "./binary-publication";
import { isLocalFileDatabaseUrl } from "./local-file-url";
import { SqlWorkerDriver } from "./turso-worker/client";
import { createWorkerDatabase } from "./turso-worker/binary-transaction";
import { WorkerBinaryPersistence } from "./turso-worker/binary-persistence";
import { PersistenceBudgetPool } from "./turso-worker/budget-pool";

export type SqliteDatabase<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> = LibSQLDatabase<TSchema>;
const forbidLocalDatabaseOpenEnv = "BRAINS_FORBID_LOCAL_DATABASE_OPEN";
// One controller ledger across every store, not a fresh allowance per connection.
// The packaged CLI and public model chunks can contain separate module copies.
// All five stores still share one process-local admission pool, not one per bundle.
const budgetKey = Symbol.for("@brains/db.persistence-budget.v1");
const runtime: typeof globalThis & { [budgetKey]?: PersistenceBudgetPool } =
  globalThis;
export interface PragmaClient {
  execute: (statement: string) => Promise<unknown>;
}
export interface SqliteWorkerArtifacts {
  workerUrl: URL;
  uploadBridgeUrl: URL;
  readBridgeUrl: URL;
}
export interface CreateSqliteDatabaseOptions<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Local Turso database URL. Remote databases are not supported. */
  url: string;
  schema: TSchema;
  /** Explicit override for hosts supplying their own packaged worker artifacts. */
  artifacts?: SqliteWorkerArtifacts;
}
export interface SqliteConnection<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> {
  db: SqliteDatabase<TSchema>;
  client: Client;
  url: string;
  /** Entity schemas own the binary plane alongside their SQL worker. */
  binary?: BinaryPersistence | undefined;
}

/** All runtime stores use the owned worker. No local/native-client fallback. */
export function createSqliteDatabase<TSchema extends Record<string, unknown>>(
  options: CreateSqliteDatabaseOptions<TSchema>,
): SqliteConnection<TSchema> {
  const { url, schema } = options;
  if (!isLocalFileDatabaseUrl(url))
    throw new Error("The Turso runtime only supports file: database URLs");
  if (process.env[forbidLocalDatabaseOpenEnv] === "1")
    throw new Error(`Local SQLite opens are forbidden in this process: ${url}`);
  const artifacts = options.artifacts ?? {
    workerUrl: new URL("./turso-worker/worker.ts", import.meta.url),
    uploadBridgeUrl: new URL(
      "./turso-worker/network-ingress-worker.ts",
      import.meta.url,
    ),
    readBridgeUrl: new URL(
      "./turso-worker/network-read-worker.ts",
      import.meta.url,
    ),
  };
  const budget = runtime[budgetKey] ?? new PersistenceBudgetPool();
  runtime[budgetKey] = budget;
  const driver = new SqlWorkerDriver({
    url,
    workerUrl: artifacts.workerUrl,
    budget,
  });
  const binary = Object.hasOwn(schema, "assets")
    ? new WorkerBinaryPersistence({
        driver,
        budget,
        uploadBridgeUrl: artifacts.uploadBridgeUrl,
        readBridgeUrl: artifacts.readBridgeUrl,
      })
    : undefined;
  const db = createWorkerDatabase(
    driver,
    schema,
    binary?.bindings,
    binary ? (): Promise<void> => binary.close() : undefined,
  );
  const client = db.$client;
  return {
    url,
    client,
    db,
    ...(binary && { binary }),
  };
}

/** Enable WAL on the single-owner Turso connection. */
export async function applySqlitePragmas(
  client: PragmaClient,
  url: string,
): Promise<void> {
  if (!isLocalFileDatabaseUrl(url))
    throw new Error("The Turso runtime only supports file: database URLs");
  await client.execute("PRAGMA journal_mode = WAL");
}
