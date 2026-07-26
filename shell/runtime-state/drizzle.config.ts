import type { Config } from "drizzle-kit";
import { defineSqliteDrizzleConfig } from "@brains/db/drizzle-config";

const config: Config = defineSqliteDrizzleConfig({
  schema: "./src/schema/runtime-state.ts",
  urlEnv: "RUNTIME_STATE_DATABASE_URL",
  authTokenEnv: "RUNTIME_STATE_DATABASE_AUTH_TOKEN",
  defaultUrl: "file:./runtime-state.db",
});

export default config;
