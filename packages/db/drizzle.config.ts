import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite", // libSQL is SQLite-compatible
  driver: "libsql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:./brain.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
} satisfies Config;
