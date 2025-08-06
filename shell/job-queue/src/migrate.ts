#!/usr/bin/env bun
import { migrate } from "drizzle-orm/libsql/migrator";
import { createJobQueueDatabase, enableWALMode } from "./db";
import type { JobQueueDbConfig } from "./db";
import { Logger } from "@brains/utils";

export async function migrateJobQueue(
  config?: JobQueueDbConfig,
  logger?: Logger,
): Promise<void> {
  const log =
    logger?.child("job-queue-migrate") ??
    Logger.getInstance().child("job-queue-migrate");
  const { db, client, url } = createJobQueueDatabase(config);

  log.info("Running job queue migrations...");

  try {
    // Enable WAL mode before migrations
    await enableWALMode(client, url);

    await migrate(db, {
      migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
    });

    log.info("Job queue migrations completed successfully");
  } catch (error) {
    log.error("Job queue migration failed:", error);
    throw error;
  } finally {
    client.close();
  }
}

// Main function for running migrations directly
async function main(): Promise<void> {
  await migrateJobQueue();
}

// Run migrations if called directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
}
