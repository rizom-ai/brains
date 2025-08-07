import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/entities.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./brain.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
} satisfies Config;