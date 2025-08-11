#!/usr/bin/env bun
import { migrate } from "drizzle-orm/libsql/migrator";
import { createConversationDatabase } from "./database";
import type { ConversationDbConfig } from "./database";
import { Logger } from "@brains/utils";

export async function migrateConversations(
  config?: ConversationDbConfig,
  logger?: Logger,
): Promise<void> {
  const log =
    logger?.child("conversation-migrate") ??
    Logger.getInstance().child("conversation-migrate");
  const { db, client, url } = createConversationDatabase(config);

  log.info("Running conversation database migrations...");

  try {
    // Enable WAL mode before migrations (for better concurrent access)
    if (url.startsWith("file:")) {
      await client.execute("PRAGMA journal_mode = WAL");
    }

    // Run migrations
    await migrate(db, {
      migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
    });

    log.info("Conversation database migrations completed successfully");
  } catch (error) {
    log.error("Conversation database migration failed:", error);
    throw error;
  } finally {
    client.close();
  }
}

// Main function for running migrations directly
async function main(): Promise<void> {
  await migrateConversations();
}

// Run migrations if called directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
}
