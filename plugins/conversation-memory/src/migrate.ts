import { migrate } from "drizzle-orm/libsql/migrator";
import { createConversationDatabase } from "./db";

async function runMigration() {
  const dbUrl = process.env["CONVERSATION_DATABASE_URL"];
  const { db } = createConversationDatabase(dbUrl ? { url: dbUrl } : undefined);

  console.log("Running conversation memory migrations...");

  await migrate(db, {
    migrationsFolder: "./drizzle",
  });

  console.log("Migrations completed successfully");
  process.exit(0);
}

runMigration().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
