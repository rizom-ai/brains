#!/usr/bin/env bun
/**
 * Run database migrations for test-brain
 * This script imports the migrate utility from @brains/db
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Set the DATABASE_URL if not already set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./test-brain.db";
}

// Set the migration folder to the @brains/db drizzle folder
// This resolves the actual location of the @brains/db package
const dbPackagePath = dirname(fileURLToPath(import.meta.resolve("@brains/db")));
process.env.DRIZZLE_MIGRATION_FOLDER = join(dbPackagePath, "..", "drizzle");

// Import and run the migrate script from @brains/db
await import("@brains/db/migrate");
