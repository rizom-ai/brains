import { createClient, type Client } from "@libsql/client";
import type { Logger } from "@personal-brain/utils";

export interface DatabaseConfig {
  url?: string;
  authToken?: string;
  logger?: Logger;
}

/**
 * Create a libSQL client
 * Supports both local files and remote Turso databases
 */
export function createDatabaseClient(config: DatabaseConfig = {}): Client {
  const { url = "file:local.db", authToken, logger } = config;
  
  logger?.debug("Creating database client", { url: url.includes("file:") ? url : "remote:***" });
  
  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });
  
  return client;
}

/**
 * Initialize database schema with vector support
 */
export async function initializeDatabase(client: Client, logger?: Logger): Promise<void> {
  logger?.info("Initializing database schema");
  
  // Create entities table with vector column for embeddings
  await client.execute(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      
      -- Vector embedding for semantic search (1536 dimensions for OpenAI ada-002)
      -- Can be adjusted based on the embedding model used
      embedding F32_BLOB(1536),
      
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    )
  `);
  
  // Create indexes for regular queries
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type)
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_entities_updated ON entities(updated)
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_entities_category ON entities(category)
  `);
  
  // Create vector index for similarity search
  // Note: This syntax might need adjustment based on libSQL version
  try {
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_entities_embedding 
      ON entities(libsql_vector_idx(embedding))
    `);
    logger?.debug("Vector index created successfully");
  } catch (error) {
    // Vector indexing might not be available in all libSQL versions
    logger?.warn("Could not create vector index - vector search will use brute force", error);
  }
  
  logger?.info("Database schema initialized");
}

/**
 * Helper to convert array to Float32Array for vector operations
 */
export function toEmbedding(values: number[]): Float32Array {
  return new Float32Array(values);
}

/**
 * Helper to convert Float32Array to base64 for storage
 */
export function embeddingToBase64(embedding: Float32Array): string {
  const buffer = Buffer.from(embedding.buffer);
  return buffer.toString("base64");
}

/**
 * Helper to convert base64 back to Float32Array
 */
export function base64ToEmbedding(base64: string): Float32Array {
  const buffer = Buffer.from(base64, "base64");
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}