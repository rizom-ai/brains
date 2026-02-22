import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { JobQueueDbConfig } from "../../src/types";
import { createJobQueueDatabase } from "../../src/db";
import { migrateJobQueue } from "../../src/migrate";
import { createSilentLogger } from "@brains/test-utils";

export async function createTestJobQueueDatabase(): Promise<{
  config: JobQueueDbConfig;
  cleanup: () => Promise<void>;
  dbPath: string;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), "brain-job-queue-test-"));
  const dbPath = join(tempDir, "test-jobs.db");

  const config: JobQueueDbConfig = {
    url: `file:${dbPath}`,
  };

  await migrateJobQueue(config, createSilentLogger());

  const cleanup = async (): Promise<void> => {
    const { client } = createJobQueueDatabase(config);
    client.close();
    await rm(tempDir, { recursive: true, force: true });
  };

  return { config, cleanup, dbPath };
}
