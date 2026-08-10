import { createTestDatabase } from "@brains/test-utils";
import type { TestDatabase } from "@brains/test-utils";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createConversationDatabase } from "../../src/database";

type ConversationDatabase = ReturnType<typeof createConversationDatabase>;

export interface TestConversationDatabase extends TestDatabase {
  db: ConversationDatabase["db"];
  client: ConversationDatabase["client"];
}

/**
 * Create a temporary conversation database. Each test gets its own.
 *
 * The connection used for migration is the one handed back, and it is tracked
 * so `cleanup` closes it.
 */
export async function createTestConversationDatabase(): Promise<TestConversationDatabase> {
  let opened: ConversationDatabase | undefined;

  const database = await createTestDatabase({
    prefix: "brain-conversation-test-",
    filename: "test-conversations.db",
    migrate: async (url) => {
      opened = createConversationDatabase({ url });
      await migrate(opened.db, {
        migrationsFolder: new URL("../../drizzle", import.meta.url).pathname,
      });
    },
  });

  if (!opened) throw new Error("conversation database was not opened");
  database.track(opened.client);

  return { ...database, db: opened.db, client: opened.client };
}
