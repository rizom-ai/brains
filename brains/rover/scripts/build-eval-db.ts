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

const rootDir = resolve(import.meta.dir, "..");
const evalContentDir = join(rootDir, "eval-content");
const evalYamlPath = resolve(
  rootDir,
  "../../apps/professional-brain/brain.eval.yaml",
);

if (!existsSync(evalContentDir)) {
  console.error("No eval-content directory found at", evalContentDir);
  process.exit(1);
}

const dbBase = "/tmp/eval-db-build";
const gitRemote = "/tmp/eval-db-build-git";

// Clean previous build artifacts
for (const path of [
  `${dbBase}.db`,
  `${dbBase}-jobs.db`,
  `${dbBase}-conv.db`,
  `${dbBase}-data`,
  `${dbBase}-cache`,
  gitRemote,
]) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

// Copy eval content into temp data dir
mkdirSync(`${dbBase}-data`, { recursive: true });
cpSync(evalContentDir, `${dbBase}-data`, { recursive: true });
// Remove stale brain.db from data dir (we're building a fresh one)
const staleDb = join(`${dbBase}-data`, "brain.db");
if (existsSync(staleDb)) rmSync(staleDb);

// Set up bare git remote for directory-sync
mkdirSync(gitRemote, { recursive: true });
execSync("git init --bare", { cwd: gitRemote, stdio: "ignore" });

// Load brain config from eval yaml
const brainApp = await import("@brains/app");
const { parseInstanceOverrides, App } = brainApp;
const resolveConfig = brainApp.resolve;

const overrides = parseInstanceOverrides(readFileSync(evalYamlPath, "utf8"));
if (!overrides.brain) {
  console.error("brain.eval.yaml must contain a 'brain' field");
  process.exit(1);
}

const mod = await import(overrides.brain);
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
const jobQueue = shell.getJobQueueService();

// Wait for all jobs to complete (imports + embeddings)
const timeoutMs = 180_000;
const start = Date.now();
let lastLog = 0;

while (Date.now() - start < timeoutMs) {
  const active = await jobQueue.getActiveJobs();
  if (active.length === 0) break;

  const elapsed = Math.round((Date.now() - start) / 1000);
  if (elapsed - lastLog >= 10) {
    console.log(`Waiting for ${active.length} jobs... (${elapsed}s)`);
    lastLog = elapsed;
  }
  await new Promise((r) => setTimeout(r, 500));
}

// Report what's in the database
const entityService = shell.getEntityService();
const counts: Record<string, number> = {};
for (const type of ["post", "note", "link", "deck", "project"]) {
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
