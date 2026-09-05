#!/usr/bin/env bun
import { resolveStandardConfigWithDirectories } from "../src/standard-paths";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { ConsoleLogger } from "@brains/utils/logger";

async function main(): Promise<void> {
  const config = await resolveStandardConfigWithDirectories();
  const logger = ConsoleLogger.getInstance();

  logger.info("Running database migrations...");

  try {
    // Run all migrations in sequence
    logger.info("Running entity database migrations...");
    await migrateEntities(
      {
        url: config.database.url,
      },
      logger,
    );

    logger.info("Running job queue database migrations...");
    await migrateJobQueue(
      {
        url: config.jobQueueDatabase.url,
      },
      logger,
    );

    logger.info("Running conversation database migrations...");
    await migrateConversations(
      {
        url: config.conversationDatabase.url,
      },
      logger,
    );

    logger.info("Running runtime state database migrations...");
    await migrateRuntimeState(
      {
        url: config.runtimeStateDatabase.url,
      },
      logger,
    );

    logger.info("✅ All database migrations completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
