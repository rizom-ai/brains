#!/usr/bin/env bun
import { getStandardConfigWithDirectories } from "@brains/core";
import { migrateJobQueue } from "@brains/job-queue";
import { Logger } from "@brains/utils";

async function main(): Promise<void> {
  const config = await getStandardConfigWithDirectories();
  const logger = Logger.getInstance();

  logger.info("Running job queue database migrations...");

  try {
    await migrateJobQueue(
      {
        url: config.jobQueueDatabase.url,
        ...(config.jobQueueDatabase.authToken && {
          authToken: config.jobQueueDatabase.authToken,
        }),
      },
      logger,
    );

    logger.info("✅ Job queue database migrations completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Job queue migration failed:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
