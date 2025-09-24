#!/usr/bin/env bun
import { getStandardConfigWithDirectories } from "@brains/core";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { Logger } from "@brains/utils";

async function main(): Promise<void> {
  const config = await getStandardConfigWithDirectories();
  const logger = Logger.getInstance();

  logger.info("Running database migrations...");

  try {
    // Run all migrations in sequence
    logger.info("Running entity database migrations...");
    await migrateEntities(
      {
        url: config.database.url,
        ...(config.database.authToken && {
          authToken: config.database.authToken,
        }),
      },
      logger,
    );

    logger.info("Running job queue database migrations...");
    await migrateJobQueue(
      {
        url: config.jobQueueDatabase.url,
        ...(config.jobQueueDatabase.authToken && {
          authToken: config.jobQueueDatabase.authToken,
        }),
      },
      logger,
    );

    logger.info("Running conversation database migrations...");
    await migrateConversations(
      {
        url: config.conversationDatabase.url,
        ...(config.conversationDatabase.authToken && {
          authToken: config.conversationDatabase.authToken,
        }),
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
