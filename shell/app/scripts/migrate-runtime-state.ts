#!/usr/bin/env bun
import { getStandardConfigWithDirectories } from "@brains/core";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { Logger } from "@brains/utils";

async function main(): Promise<void> {
  const config = await getStandardConfigWithDirectories();
  const logger = Logger.getInstance();

  logger.info("Running runtime state database migrations...");

  try {
    await migrateRuntimeState(
      {
        url: config.runtimeStateDatabase.url,
        ...(config.runtimeStateDatabase.authToken && {
          authToken: config.runtimeStateDatabase.authToken,
        }),
      },
      logger,
    );

    logger.info("✅ Runtime state database migrations completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Runtime state database migration failed:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
