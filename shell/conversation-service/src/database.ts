import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { conversations, messages, summaryTracking } from "./schema";
import type { ConversationDbConfig } from "./types";

export type ConversationDB = LibSQLDatabase<Record<string, unknown>>;

/**
 * Create a conversation database connection
 * Config is now required - use createShellServiceConfig() for standard paths
 */
export function createConversationDatabase(config: ConversationDbConfig): {
  db: ConversationDB;
  client: Client;
  url: string;
} {
  const url = config.url;

  const authToken =
    config.authToken ?? process.env["CONVERSATION_DATABASE_AUTH_TOKEN"];

  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });

  const db = drizzle(client, {
    schema: { conversations, messages, summaryTracking },
  });

  return { db, client, url };
}

/**
 * Enable WAL mode and set busy timeout for better concurrent access
 */
export async function enableWALModeForConversations(
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
