import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { ConversationDbConfig } from "../../src/types";
import { createConversationDatabase } from "../../src/database";
import { migrate } from "drizzle-orm/libsql/migrator";
import { closeSqliteClient, type SqliteEngine } from "@brains/db";

/**
 * Create a temporary test conversation database
 * Each test gets its own isolated database
 */
export async function createTestConversationDatabase(): Promise<{
  db: ReturnType<typeof createConversationDatabase>["db"];
  client: ReturnType<typeof createConversationDatabase>["client"];
  cleanup: () => Promise<void>;
  dbPath: string;
  engine: SqliteEngine;
}> {
  // Create a unique temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), "brain-conversation-test-"));
  const dbPath = join(tempDir, "test-conversations.db");

  // Create config
  const config: ConversationDbConfig = {
    url: `file:${dbPath}`,
  };

  // Create database
  const { db, client, engine } = createConversationDatabase(config);

  // Run migrations
  await migrate(db, {
    migrationsFolder: new URL("../../drizzle", import.meta.url).pathname,
  });

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    // Close the database connection
    await closeSqliteClient(client);

    // Remove temporary directory
    await rm(tempDir, { recursive: true, force: true });
  };

  return { db, client, cleanup, dbPath, engine };
}
