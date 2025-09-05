#!/usr/bin/env bun
import { getStandardConfigWithDirectories } from "@brains/core";
import { migrateEntities } from "@brains/entity-service/migrate";
import { Logger } from "@brains/utils";

async function main(): Promise<void> {
  const config = await getStandardConfigWithDirectories();
  const logger = Logger.getInstance();

  logger.info("Running entity database migrations...");

  try {
    await migrateEntities(
      {
        url: config.database.url,
        ...(config.database.authToken && {
          authToken: config.database.authToken,
        }),
      },
      logger,
    );

    logger.info("✅ Entity database migrations completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Entity migration failed:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
