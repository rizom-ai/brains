import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { jobQueue } from "../schema/job-queue";
import type { JobQueueDbConfig } from "../types";

export type JobQueueDB = ReturnType<typeof drizzle>;

/**
 * Create a job queue database connection
 * Config is now required - use createShellServiceConfig() for standard paths
 */
export function createJobQueueDatabase(config: JobQueueDbConfig): {
  db: JobQueueDB;
  client: Client;
  url: string;
} {
  const url = config.url;

  const authToken =
    config.authToken ?? process.env["JOB_QUEUE_DATABASE_AUTH_TOKEN"];

  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });

  const db = drizzle(client, { schema: { jobQueue } });

  return { db, client, url };
}

/**
 * Enable WAL mode and set busy timeout for better concurrent access
 * This should be called during initialization
 */
export async function enableWALMode(
  client: Client,
  url: string,
): Promise<void> {
  // Only enable WAL mode and busy timeout for local SQLite files
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
    // Set busy timeout to 5 seconds - SQLite will wait instead of returning SQLITE_BUSY
    await client.execute("PRAGMA busy_timeout = 5000");
  }
}

/**
 * Type for the job queue database
 */
export type JobQueueDatabase = ReturnType<typeof createJobQueueDatabase>;
