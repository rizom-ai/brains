import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { entities } from "../schema/entities";
import type { EntityDbConfig } from "../types";

export type EntityDB = LibSQLDatabase<Record<string, unknown>>;

/**
 * Create an entity database connection
 * Config is now required - use createShellServiceConfig() for standard paths
 */
export function createEntityDatabase(config: EntityDbConfig): {
  db: EntityDB;
  client: Client;
  url: string;
} {
  const url = config.url;
  const authToken = config.authToken ?? process.env["DATABASE_AUTH_TOKEN"];

  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });

  const db = drizzle(client, { schema: { entities } });

  return { db, client, url };
}

/**
 * Enable WAL mode and set busy timeout for better concurrent access
 * This should be called during initialization
 */
export async function enableWALModeForEntities(
  client: Client,
  url: string,
): Promise<void> {
  // Only enable WAL mode and busy timeout for local SQLite files
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
    // Set busy timeout to 5 seconds - SQLite will wait instead of returning SQLITE_BUSY
    await client.execute("PRAGMA busy_timeout = 5000");
  }
}

/**
 * Create FTS5 virtual table for full-text keyword search on entity content.
 * Called during entity DB initialization alongside WAL mode setup.
 */
export async function ensureFtsTable(client: Client): Promise<void> {
  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS entity_fts USING fts5(
      entity_id UNINDEXED,
      entity_type UNINDEXED,
      content
    )
  `);
}

/**
 * Type for the entity database
 */
export type EntityDatabase = ReturnType<typeof createEntityDatabase>;
