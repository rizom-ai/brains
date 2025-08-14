import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../schema/job-queue";

export interface JobQueueDbConfig {
  url: string; // Now required - no default
  authToken?: string;
}

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

  const db = drizzle(client, { schema });

  return { db, client, url };
}

/**
 * Enable WAL mode for better concurrent access
 * This should be called during initialization
 */
export async function enableWALMode(
  client: Client,
  url: string,
): Promise<void> {
  // Only enable WAL mode for local SQLite files
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
  }
}

/**
 * Type for the job queue database
 */
export type JobQueueDatabase = ReturnType<typeof createJobQueueDatabase>;
