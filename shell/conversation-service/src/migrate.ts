#!/usr/bin/env bun
import {
  refuseDirectMigrationRun,
  resolveMigrationsFolder,
  runPackageMigrations,
} from "@brains/db";
import { conversations, messages, summaryTracking } from "./schema";
import type { ConversationDbConfig } from "./types";
import type { Logger } from "@brains/utils/logger";

export async function migrateConversations(
  config: ConversationDbConfig,
  logger?: Logger,
): Promise<void> {
  await runPackageMigrations({
    label: "conversation",
    config,
    schema: { conversations, messages, summaryTracking },
    migrationsFolder: resolveMigrationsFolder(
      import.meta.url,
      "conversation-service",
    ),
    authTokenEnv: "CONVERSATION_DATABASE_AUTH_TOKEN",
    logger,
  });
}

// Migration scripts should only be called from app contexts,
// not run directly. Use your app's migration script instead.
if (import.meta.main) {
  refuseDirectMigrationRun();
}
