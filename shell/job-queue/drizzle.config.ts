import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/job-queue.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.JOB_QUEUE_DATABASE_URL ?? "file:./brain-jobs.db",
    authToken: process.env.JOB_QUEUE_DATABASE_AUTH_TOKEN,
  },
} satisfies Config;
