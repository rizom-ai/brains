#!/usr/bin/env bun
import { resolveStandardConfigWithDirectories } from "../src/standard-paths";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { ConsoleLogger } from "@brains/utils/logger";

async function main(): Promise<void> {
  const config = await resolveStandardConfigWithDirectories();
  const logger = ConsoleLogger.getInstance();

  logger.info("Running conversation database migrations...");

  try {
    await migrateConversations(
      {
        url: config.conversationDatabase.url,
      },
      logger,
    );

    logger.info("✅ Conversation database migrations completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Conversation migration failed:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
