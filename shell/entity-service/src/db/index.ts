import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../schema/entities";

export interface EntityDbConfig {
  url?: string;
  authToken?: string;
}

export type EntityDB = LibSQLDatabase<typeof schema>;

/**
 * Create an entity database connection
 * Defaults to a local file database if no URL is provided
 */
export function createEntityDatabase(config: EntityDbConfig = {}): {
  db: EntityDB;
  client: Client;
  url: string;
} {
  const url = config.url ?? process.env["DATABASE_URL"] ?? "file:./brain.db";
  const authToken = config.authToken ?? process.env["DATABASE_AUTH_TOKEN"];

  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });

  const db = drizzle(client, { schema });

  return { db, client, url };
}

/**
 * Enable WAL mode for better concurrent access
 * This should be called during initialization
 */
export async function enableWALModeForEntities(
  client: Client,
  url: string,
): Promise<void> {
  // Only enable WAL mode for local SQLite files
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
  }
}

/**
 * Ensure critical indexes exist for entities
 * This includes vector indexes for similarity search
 */
export async function ensureEntityIndexes(client: Client): Promise<void> {
  // Create vector index for efficient similarity search
  await client.execute(`
    CREATE INDEX IF NOT EXISTS entities_embedding_idx 
    ON entities(libsql_vector_idx(embedding))
  `);
}

/**
 * Type for the entity database
 */
export type EntityDatabase = ReturnType<typeof createEntityDatabase>;
