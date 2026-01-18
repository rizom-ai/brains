#!/usr/bin/env bun
import { migrate } from "drizzle-orm/libsql/migrator";
import { createJobQueueDatabase, enableWALMode } from "./db";
import type { JobQueueDbConfig } from "./types";
import { Logger } from "@brains/utils";

export async function migrateJobQueue(
  config: JobQueueDbConfig,
  logger?: Logger,
): Promise<void> {
  const log =
    logger?.child("job-queue-migrate") ??
    Logger.getInstance().child("job-queue-migrate");
  const { db, client, url } = createJobQueueDatabase(config);

  log.debug("Running job queue migrations...");

  try {
    // Enable WAL mode before migrations
    await enableWALMode(client, url);

    // Detect if running from bundled dist
    const isBundled = import.meta.url.includes("/dist/");
    const migrationsFolder = isBundled
      ? new URL("./migrations/job-queue", import.meta.url).pathname
      : new URL("../drizzle", import.meta.url).pathname;
    await migrate(db, { migrationsFolder });

    log.debug("Job queue migrations completed successfully");
  } catch (error) {
    log.error("Job queue migration failed:", error);
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
