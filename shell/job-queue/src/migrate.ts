#!/usr/bin/env bun
import {
  refuseDirectMigrationRun,
  resolveMigrationsFolder,
  runPackageMigrations,
} from "@brains/db";
import type { Logger } from "@brains/utils/logger";
import { jobQueue, jobWorkerSessions } from "./schema/job-queue";
import type { JobQueueDbConfig } from "./types";

export async function migrateJobQueue(
  config: JobQueueDbConfig,
  logger?: Logger,
): Promise<void> {
  await runPackageMigrations({
    label: "job-queue",
    config,
    schema: { jobQueue, jobWorkerSessions },
    migrationsFolder: resolveMigrationsFolder(import.meta.url, "job-queue"),
    logger,
  });
}

// Migration scripts should only be called from app contexts,
// not run directly. Use your app's migration script instead.
if (import.meta.main) {
  refuseDirectMigrationRun();
}
