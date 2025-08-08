import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/conversations.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url:
      process.env["CONVERSATION_DATABASE_URL"] ??
      "file:./data/conversation-memory.db",
  },
} satisfies Config;
