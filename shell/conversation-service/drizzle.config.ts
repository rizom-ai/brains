import type { Config } from "drizzle-kit";
import { defineSqliteDrizzleConfig } from "@brains/db/drizzle-config";

const config: Config = defineSqliteDrizzleConfig({
  schema: "./src/schema.ts",
  urlEnv: "CONVERSATION_DATABASE_URL",
  authTokenEnv: "CONVERSATION_DATABASE_AUTH_TOKEN",
  defaultUrl: "file:./conversations.db",
});

export default config;
