#!/usr/bin/env bun
/**
 * Run Drizzle Studio for test-brain databases
 * Usage: bun scripts/studio.ts [entities|conversations|jobs]
 */
import { spawn } from "child_process";
import { resolve } from "path";

const database = process.argv[2] || "entities";

const configs = {
  entities: {
    dir: "../../shell/entity-service",
    env: "DATABASE_URL",
    file: "test-brain.db",
    name: "Entity Database",
  },
  conversations: {
    dir: "../../shell/conversation-service",
    env: "CONVERSATION_DATABASE_URL",
    file: "conversations.db",
    name: "Conversation Database",
  },
  jobs: {
    dir: "../../shell/job-queue",
    env: "JOB_QUEUE_DATABASE_URL",
    file: "test-brain-jobs.db",
    name: "Job Queue Database",
  },
};

const config = configs[database as keyof typeof configs];

if (!config) {
  console.error(`Unknown database: ${database}`);
  console.log("Available options: entities, conversations, jobs");
  process.exit(1);
}

console.log(`Starting Drizzle Studio for ${config.name}...`);

// Build the database URL relative to the service directory
const dbUrl = `file:../../apps/test-brain/${config.file}`;

const child = spawn("bun", ["run", "db:studio"], {
  cwd: resolve(import.meta.dir, "..", config.dir),
  env: {
    ...process.env,
    [config.env]: dbUrl,
  },
  stdio: "inherit",
});

child.on("error", (err) => {
  console.error("Failed to start Drizzle Studio:", err);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code || 0);
});