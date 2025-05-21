import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

/**
 * Database connection type
 */
export type DrizzleDB = BunSQLiteDatabase;

/**
 * Create a drizzle database connection with configurable path
 *
 * This allows each app to specify its own database location
 */
export function createDatabase(
  options: {
    dbPath?: string;
  } = {},
): DrizzleDB {
  // Determine database path prioritizing:
  // 1. Explicitly provided path parameter
  // 2. Environment variable
  // 3. Default path
  const dbPath = options.dbPath ?? process.env["DB_PATH"] ?? "./brain.db";

  // Create SQLite connection
  const sqlite = new Database(dbPath);

  // Enable foreign keys
  sqlite.exec("PRAGMA foreign_keys = ON");

  // Create drizzle DB instance
  return drizzle(sqlite);
}

// Export all schema components
export { entities, entityChunks, entityEmbeddings, createId } from "./schema";
