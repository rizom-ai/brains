import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { embeddings } from "../schema/embeddings";
import type { EntityDbConfig } from "../types";

export type EmbeddingDB = LibSQLDatabase<Record<string, unknown>>;

/**
 * Create an embedding database connection.
 * This is a separate database from the entity database,
 * containing only the embeddings table.
 */
export function createEmbeddingDatabase(config: EntityDbConfig): {
  db: EmbeddingDB;
  client: Client;
  url: string;
} {
  const url = config.url;
  const authToken = config.authToken ?? process.env["DATABASE_AUTH_TOKEN"];

  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });

  const db = drizzle(client, { schema: { embeddings } });

  return { db, client, url };
}

/**
 * Enable WAL mode for the embedding database
 */
export async function enableWALModeForEmbeddings(
  client: Client,
  url: string,
): Promise<void> {
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
}

/**
 * Create the embeddings table in the embedding database.
 * Dimensions come from the embedding provider (e.g. 1536 for OpenAI, 384 for fastembed).
 */
export async function migrateEmbeddingDatabase(
  client: Client,
  dimensions: number,
): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS embeddings (
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      embedding F32_BLOB(${dimensions}) NOT NULL,
      content_hash TEXT NOT NULL,
      PRIMARY KEY(entity_id, entity_type)
    )
  `);
}

/**
 * Ensure vector index exists on the embedding database
 */
export async function ensureEmbeddingIndexes(client: Client): Promise<void> {
  await client.execute(`
    CREATE INDEX IF NOT EXISTS embeddings_embedding_idx
    ON embeddings(libsql_vector_idx(embedding))
  `);
}

/**
 * Attach the embedding database to an entity database client.
 * This enables cross-database joins for search queries.
 *
 * @param entityClient - The libsql client connected to the entity database
 * @param embeddingDbPath - File path (without file: prefix) to the embedding database
 */
export async function attachEmbeddingDatabase(
  entityClient: Client,
  embeddingDbPath: string,
): Promise<void> {
  await entityClient.execute(`ATTACH DATABASE '${embeddingDbPath}' AS emb`);
}

/**
 * Extract the file path from a database URL.
 * Strips the "file:" prefix.
 */
export function dbUrlToPath(url: string): string {
  return url.startsWith("file:") ? url.slice(5) : url;
}
