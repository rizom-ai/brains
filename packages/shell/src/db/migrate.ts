#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";

/**
 * This script runs database migrations using drizzle-kit
 *
 * Usage:
 *   bun db:migrate [--db-path=./custom-path.db]
 */

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let dbPath = "./brain.db";

  // Look for --db-path argument
  const dbPathArg = args.find((arg) => arg.startsWith("--db-path="));
  if (dbPathArg) {
    const splitPath = dbPathArg.split("=")[1];
    if (splitPath) {
      dbPath = splitPath;
    }
  }

  console.log(`Running migrations on database: ${dbPath}`);

  // Create database connection
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  // Run migrations from the drizzle directory
  console.log("Starting migrations...");
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations completed successfully!");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
