import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Logger } from "@brains/utils";

/**
 * Database connection type
 */
export type DrizzleDB = LibSQLDatabase<Record<string, never>>;

/**
 * Create a drizzle database connection with libSQL
 *
 * This allows each app to specify its own database location or use remote Turso
 */
export function createDatabase(
  options: {
    url?: string;
    authToken?: string | undefined;
  } = {},
): { db: DrizzleDB; client: Client } {
  // Determine database URL prioritizing:
  // 1. Explicitly provided URL
  // 2. Environment variable
  // 3. Default local file
  const url = options.url ?? process.env["DATABASE_URL"] ?? "file:./brain.db";
  const authToken = options.authToken ?? process.env["DATABASE_AUTH_TOKEN"];

  // Create libSQL client
  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });

  // Create drizzle DB instance
  const db = drizzle(client);

  return { db, client };
}

/**
 * Enable WAL mode for better concurrent access
 * This should be called during initialization to prevent SQLITE_READONLY_DBMOVED errors
 *
 * @param client The libSQL client
 * @param url The database URL (to check if it's a local file)
 * @param logger Logger for output
 */
export async function enableWALMode(
  client: Client,
  url: string,
  logger: Logger,
): Promise<void> {
  // Only enable WAL mode for local SQLite files
  // Remote Turso connections already use WAL internally
  if (url.startsWith("file:")) {
    try {
      await client.execute("PRAGMA journal_mode = WAL");
      logger.debug("Enabled WAL mode for local SQLite database");
    } catch (error) {
      // Non-fatal: continue even if WAL mode fails
      logger.warn("Failed to enable WAL mode (non-fatal)", error);
    }
  }
}

/**
 * Run database migrations
 *
 * @param db The database instance
 * @param migrationsPath Optional path to migrations folder
 */
export async function runMigrations(
  db: DrizzleDB,
  migrationsPath?: string,
): Promise<void> {
  // If no path provided, use the db package's migrations
  const folder =
    migrationsPath ?? new URL("../drizzle", import.meta.url).pathname;
  await migrate(db, { migrationsFolder: folder });
}

// Re-export schema types for convenience
export * from "./schema";

// Re-export drizzle-orm query builders for centralized dependency management
export { eq, and, or, inArray, desc, asc, sql } from "drizzle-orm";
