import type { Config } from "drizzle-kit";
import { defineSqliteDrizzleConfig } from "@brains/db/drizzle-config";

const config: Config = defineSqliteDrizzleConfig({
  schema: "./src/schema/job-queue.ts",
  urlEnv: "JOB_QUEUE_DATABASE_URL",
  authTokenEnv: "JOB_QUEUE_DATABASE_AUTH_TOKEN",
  defaultUrl: "file:./brain-jobs.db",
});

export default config;
