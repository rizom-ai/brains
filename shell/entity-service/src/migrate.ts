#!/usr/bin/env bun
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  createEntityDatabase,
  enableWALModeForEntities,
  ensureEntityIndexes,
} from "./db";
import type { EntityDbConfig } from "./db";
import { Logger } from "@brains/utils";

export async function migrateEntities(
  config: EntityDbConfig,
  logger?: Logger,
): Promise<void> {
  const log =
    logger?.child("entity-migrate") ??
    Logger.getInstance().child("entity-migrate");
  const { db, client, url } = createEntityDatabase(config);

  log.info("Running entity database migrations...");

  try {
    // Enable WAL mode before migrations
    await enableWALModeForEntities(client, url);

    // Run migrations
    await migrate(db, {
      migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
    });

    // Ensure indexes exist
    await ensureEntityIndexes(client);

    log.info("Entity database migrations completed successfully");
  } catch (error) {
    log.error("Entity database migration failed:", error);
    throw error;
  } finally {
    client.close();
  }
}

// Migration scripts should only be called from app contexts,
// not run directly. Use your app's migration script instead.
if (import.meta.main) {
  console.error("Migration scripts should not be run directly.");
  console.error(
    "Please use your app's migration script instead (e.g., bun run scripts/migrate.ts)",
  );
  process.exit(1);
}
