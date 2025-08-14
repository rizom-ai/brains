import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export interface ConversationDbConfig {
  url?: string;
  authToken?: string;
}

export type ConversationDB = LibSQLDatabase<typeof schema>;

/**
 * Create a conversation database connection
 * Defaults to a local file database if no URL is provided
 */
export function createConversationDatabase(config: ConversationDbConfig = {}): {
  db: ConversationDB;
  client: Client;
  url: string;
} {
  const url = config.url ?? "file:./data/conversations.db";

  const authToken =
    config.authToken ?? process.env["CONVERSATION_DATABASE_AUTH_TOKEN"];

  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });

  const db = drizzle(client, { schema });

  return { db, client, url };
}

/**
 * Enable WAL mode for better concurrent access
 */
export async function enableWALModeForConversations(
  client: Client,
  url: string,
): Promise<void> {
  // Only enable WAL mode for local SQLite files
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
  }
}
