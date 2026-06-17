import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/runtime-state.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.RUNTIME_STATE_DATABASE_URL ?? "file:./runtime-state.db",
    authToken: process.env.RUNTIME_STATE_DATABASE_AUTH_TOKEN,
  },
} satisfies Config;
