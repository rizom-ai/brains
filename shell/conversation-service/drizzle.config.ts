import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.CONVERSATION_DATABASE_URL ?? "file:./conversations.db",
    authToken: process.env.CONVERSATION_DATABASE_AUTH_TOKEN,
  },
} satisfies Config;
