import type { Config } from "drizzle-kit";
import { defineSqliteDrizzleConfig } from "@brains/db/drizzle-config";

const config: Config = defineSqliteDrizzleConfig({
  schema: [
    "./src/schema/assets.ts",
    "./src/schema/entities.ts",
    "./src/schema/entity-export-state.ts",
    "./src/schema/embeddings.ts",
    "./src/schema/entity-job-outbox.ts",
    "./src/schema/projection-batches.ts",
    "./src/schema/projection-state.ts",
  ],
  urlEnv: "DATABASE_URL",
  authTokenEnv: "DATABASE_AUTH_TOKEN",
  defaultUrl: "file:./brain.db",
});

export default config;
