import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { EntityDbConfig } from "../../src/db";
import { createEntityDatabase } from "../../src/db";
import { migrateEntities } from "../../src/migrate";
import { createSilentLogger } from "@brains/utils";

/**
 * Create a temporary test entity database
 * Each test gets its own isolated database
 */
export async function createTestEntityDatabase(): Promise<{
  config: EntityDbConfig;
  cleanup: () => Promise<void>;
  dbPath: string;
}> {
  // Create a unique temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), "brain-entity-test-"));
  const dbPath = join(tempDir, "test-entities.db");

  // Create config
  const config: EntityDbConfig = {
    url: `file:${dbPath}`,
  };

  // Run migrations
  const logger = createSilentLogger();
  await migrateEntities(config, logger);

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    // Close the database connection if needed
    const { client } = createEntityDatabase(config);
    client.close();

    // Remove temporary directory
    await rm(tempDir, { recursive: true, force: true });
  };

  return { config, cleanup, dbPath };
}
