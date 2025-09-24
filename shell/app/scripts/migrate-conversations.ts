#!/usr/bin/env bun
import { getStandardConfigWithDirectories } from "@brains/core";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { Logger } from "@brains/utils";

async function main(): Promise<void> {
  const config = await getStandardConfigWithDirectories();
  const logger = Logger.getInstance();

  logger.info("Running conversation database migrations...");

  try {
    await migrateConversations(
      {
        url: config.conversationDatabase.url,
        ...(config.conversationDatabase.authToken && {
          authToken: config.conversationDatabase.authToken,
        }),
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
