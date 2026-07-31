import {
  createSqliteDatabase,
  type SqliteConnection,
  type SqliteDatabase,
} from "@brains/db";
import { conversations, messages, summaryTracking } from "./schema";
import type { ConversationDbConfig } from "./types";

export type ConversationDB = SqliteDatabase;

/**
 * Create a conversation database connection
 * Config is now required - use createShellServiceConfig() for standard paths
 */
export function createConversationDatabase(
  config: ConversationDbConfig,
): SqliteConnection {
  return createSqliteDatabase({
    url: config.url,
    schema: { conversations, messages, summaryTracking },
    authToken: config.authToken,
    authTokenEnv: "CONVERSATION_DATABASE_AUTH_TOKEN",
  });
}
