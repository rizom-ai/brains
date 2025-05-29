import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { resolve } from "path";

import * as schema from "./schema";
export * from "./schema";
export { runMigrations } from "./migrate";

/**
 * Create a database connection
 */
export function createDB(dbPath?: string): schema.DrizzleDB {
  // Use provided path or default to brain.db in current directory
  const path = dbPath || resolve(process.cwd(), "brain.db");

  // Create SQLite connection
  const sqlite = new Database(path);

  // Create Drizzle ORM instance
  return drizzle(sqlite, { schema });
}
