#!/usr/bin/env bun
import { migrate } from "drizzle-orm/libsql/migrator";
import { createConversationDatabase } from "./database";
import type { ConversationDbConfig } from "./database";
import { Logger } from "@brains/utils";

export async function migrateConversations(
  config: ConversationDbConfig,
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

// Migration scripts should only be called from app contexts,
// not run directly. Use your app's migration script instead.
if (import.meta.main) {
  console.error("Migration scripts should not be run directly.");
  console.error(
    "Please use your app's migration script instead (e.g., bun run scripts/migrate.ts)",
  );
  process.exit(1);
}
