import type { Config } from "drizzle-kit";

export default {
  schema: ["./src/runtime-schema.ts", "./src/invitation-schema.ts"],
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.AUTH_DATABASE_URL ?? "file:./auth.db",
    authToken: process.env.AUTH_DATABASE_AUTH_TOKEN,
  },
} satisfies Config;
