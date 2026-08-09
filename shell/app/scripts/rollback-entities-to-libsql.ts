#!/usr/bin/env bun
import { prepareEntityDatabaseForLibsql } from "@brains/entity-service/rollback";
import { Logger } from "@brains/utils/logger";
import { resolveStandardConfigWithDirectories } from "../src/standard-paths";

async function main(): Promise<void> {
  const config = await resolveStandardConfigWithDirectories();
  const logger = Logger.getInstance();

  logger.warn(
    "Preparing the entity database for libSQL fallback; the app must be stopped",
  );

  try {
    await prepareEntityDatabaseForLibsql(config.database);
    logger.info(
      "Entity database prepared. Set BRAINS_DB_ENGINE=libsql before restarting.",
    );
    process.exit(0);
  } catch (error) {
    logger.error("Failed to prepare the entity database for libSQL:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
