/**
 * Build pre-populated eval database from eval-content.
 *
 * Boots a brain with eval-content, waits for the job queue to drain
 * (all imports + embeddings complete), then copies brain.db into
 * eval-content/brain.db.
 *
 * Usage: bun brains/rover/scripts/build-eval-db.ts
 *
 * Re-run whenever eval-content changes.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readFileSync,
} from "fs";
import { execSync } from "child_process";
import { resolve, join } from "path";
import { config as loadEnv } from "dotenv";

// Load API keys from the eval .env file (single source for eval secrets).
// Resolve via the @brains/ai-evaluation package so the path isn't fragile.
const evalPkgDir = resolve(
  import.meta
    .resolve("@brains/ai-evaluation")
    .replace("file://", "")
    .replace(/\/src\/.*$/, ""),
);
loadEnv({ path: join(evalPkgDir, ".env") });

const rootDir = resolve(import.meta.dir, "..");
const evalContentDir = join(rootDir, "eval-content");
const evalYamlPath = join(rootDir, "brain.eval.yaml");

if (!existsSync(evalContentDir)) {
  console.error("No eval-content directory found at", evalContentDir);
  process.exit(1);
}

const dbBase = "/tmp/eval-db-build";

// Clean previous build artifacts
for (const path of [
  `${dbBase}.db`,
  `${dbBase}-jobs.db`,
  `${dbBase}-conv.db`,
  `${dbBase}-data`,
  `${dbBase}-cache`,
  "/tmp/brain-eval-git-remote",
]) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

// Create bare git repo for directory-sync history tool
const gitRemote = "/tmp/brain-eval-git-remote";
process.env["EVAL_GIT_REMOTE"] = gitRemote;
if (existsSync(gitRemote)) rmSync(gitRemote, { recursive: true, force: true });
mkdirSync(gitRemote, { recursive: true });
execSync("git init --bare", { cwd: gitRemote, stdio: "ignore" });

// Copy eval content into temp data dir
mkdirSync(`${dbBase}-data`, { recursive: true });
cpSync(evalContentDir, `${dbBase}-data`, { recursive: true });
// Remove stale brain.db from data dir (we're building a fresh one)
const staleDb = join(`${dbBase}-data`, "brain.db");
if (existsSync(staleDb)) rmSync(staleDb);

// Load brain config from eval yaml
const brainApp = await import("@brains/app");
const { parseInstanceOverrides, App } = brainApp;
const resolveConfig = brainApp.resolve;

const overrides = parseInstanceOverrides(readFileSync(evalYamlPath, "utf8"));
if (!overrides.brain) {
  console.error("brain.eval.yaml must contain a 'brain' field");
  process.exit(1);
}

const brainPackage = overrides.brain.startsWith("@")
  ? overrides.brain
  : `@brains/${overrides.brain}`;
const mod = await import(brainPackage);
const config = resolveConfig(mod.default, process.env, overrides);

console.log("Booting brain to build eval database...");

const app = App.create({
  ...config,
  database: undefined,
  shellConfig: {
    ...config.shellConfig,
    database: { url: `file:${dbBase}.db` },
    jobQueueDatabase: { url: `file:${dbBase}-jobs.db` },
    conversationDatabase: { url: `file:${dbBase}-conv.db` },
    embedding: { cacheDir: `${dbBase}-cache` },
    dataDir: `${dbBase}-data`,
  },
});

await app.initialize();

const shell = app.getShell();
const messageBus = shell.getMessageBus();
const jobQueue = shell.getJobQueueService();

// Wait for initial sync to complete (import all files from eval-content)
console.log("Waiting for initial sync...");
await new Promise<void>((resolve) => {
  messageBus.subscribe("sync:initial:completed", async () => {
    console.log("Initial sync completed.");
    resolve();
    return { success: true };
  });
});

// Wait for remaining jobs (embeddings, site build)
console.log("Waiting for remaining jobs...");
for (;;) {
  const active = await jobQueue.getActiveJobs();
  if (active.length === 0) break;
  const byType: Record<string, number> = {};
  for (const job of active) {
    byType[job.type] = (byType[job.type] ?? 0) + 1;
  }
  console.log(
    `${active.length} jobs: ${Object.entries(byType)
      .map(([t, n]) => `${t}(${n})`)
      .join(" ")}`,
  );
  await new Promise((r) => setTimeout(r, 2000));
}

// Final report
const entityService = shell.getEntityService();
const counts: Record<string, number> = {};
for (const type of ["post", "base", "link", "deck", "project", "agent"]) {
  counts[type] = (await entityService.listEntities(type)).length;
}
console.log("Database contents:", counts);

const total = Object.values(counts).reduce((a, b) => a + b, 0);
if (total === 0) {
  console.error("No entities found — sync failed. Check logs above.");
  process.exit(1);
}

// Checkpoint WAL into main database before copying
const { Database } = await import("bun:sqlite");
const db = new Database(`${dbBase}.db`);
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
db.close();

// Copy built database to eval-content
const outputPath = join(evalContentDir, "brain.db");
copyFileSync(`${dbBase}.db`, outputPath);
console.log(`Saved eval database to ${outputPath}`);

process.exit(0);
