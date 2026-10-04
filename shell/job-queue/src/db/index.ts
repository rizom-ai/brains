import {
  createSqliteDatabase,
  type SqliteConnection,
  type SqliteDatabase,
} from "@brains/db";
import { jobQueue, jobWorkerSessions } from "../schema/job-queue";
import type { JobQueueDbConfig } from "../types";

export type JobQueueDB = SqliteDatabase;

/**
 * Create a job queue database connection
 * Config is now required - use createShellServiceConfig() for standard paths
 */
export function createJobQueueDatabase(
  config: JobQueueDbConfig,
): SqliteConnection {
  return createSqliteDatabase({
    url: config.url,
    schema: { jobQueue, jobWorkerSessions },
    authToken: config.authToken,
    authTokenEnv: "JOB_QUEUE_DATABASE_AUTH_TOKEN",
    // JobQueueRepository owns contention: it retries whole transactions within
    // its own bounded budget, so the client surfaces each refusal at once.
    contentionRetryBudgetMs: 0,
  });
}

/**
 * Type for the job queue database
 */
export type JobQueueDatabase = SqliteConnection;
