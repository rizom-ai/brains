import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { resolve } from "path";
import { Logger } from "../utils/logger";

/**
 * Run database migrations
 */
export async function runMigrations(
  dbPath: string,
  logger: Logger,
): Promise<void> {
  logger.info(`Running migrations on database: ${dbPath}`);

  // Create database connection
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  // Run migrations from the drizzle directory
  const migrationsFolder = resolve(process.cwd(), "drizzle");
  logger.info(`Using migrations from: ${migrationsFolder}`);

  try {
    migrate(db, { migrationsFolder });
    logger.info("Migrations completed successfully");
  } catch (error) {
    logger.error("Migration failed", { error });
    throw error;
  } finally {
    // Close database connection
    sqlite.close();
  }
}
