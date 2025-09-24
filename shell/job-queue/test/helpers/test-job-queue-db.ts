import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { JobQueueDbConfig } from "../../src/types";
// Import implementations directly for tests - these are test utilities only
import { createJobQueueDatabase } from "../../src/db";
import { migrateJobQueue } from "../../src/migrate";
import { createSilentLogger } from "@brains/utils";

/**
 * Create a temporary test job queue database
 * Each test gets its own isolated database
 */
export async function createTestJobQueueDatabase(): Promise<{
  config: JobQueueDbConfig;
  cleanup: () => Promise<void>;
  dbPath: string;
}> {
  // Create a unique temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), "brain-job-queue-test-"));
  const dbPath = join(tempDir, "test-jobs.db");

  // Create config
  const config: JobQueueDbConfig = {
    url: `file:${dbPath}`,
  };

  // Run migrations
  const logger = createSilentLogger();
  await migrateJobQueue(config, logger);

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    // Close the database connection if needed
    const { client } = createJobQueueDatabase(config);
    client.close();

    // Remove temporary directory
    await rm(tempDir, { recursive: true, force: true });
  };

  return { config, cleanup, dbPath };
}
