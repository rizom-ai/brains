import { createSilentLogger, createTestDatabase } from "@brains/test-utils";
import type { TestDatabase } from "@brains/test-utils";
import type { JobQueueDbConfig } from "../../src/types";
import { migrateJobQueue } from "../../src/migrate";

export interface TestJobQueueDatabase extends TestDatabase {
  config: JobQueueDbConfig;
}

export async function createTestJobQueueDatabase(): Promise<TestJobQueueDatabase> {
  const database = await createTestDatabase({
    prefix: "brain-job-queue-test-",
    filename: "test-jobs.db",
    migrate: (url) => migrateJobQueue({ url }, createSilentLogger()),
  });

  return { ...database, config: { url: database.url } };
}
