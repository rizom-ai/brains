import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { entities } from "../schema/entities";
import { embeddings } from "../schema/embeddings";
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

  const db = drizzle(client, { schema: { entities, embeddings } });

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
 * Ensure critical indexes exist for entities and embeddings
 * This includes vector indexes for similarity search
 */
export async function ensureEntityIndexes(client: Client): Promise<void> {
  // Create vector index for efficient similarity search on embeddings table
  await client.execute(`
    CREATE INDEX IF NOT EXISTS embeddings_embedding_idx
    ON embeddings(libsql_vector_idx(embedding))
  `);
}

/**
 * Type for the entity database
 */
export type EntityDatabase = ReturnType<typeof createEntityDatabase>;
