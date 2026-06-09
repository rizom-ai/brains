import { copyFileSync, existsSync, rmSync } from "fs";
import { resolve as resolvePath } from "path";
import type { AppConfig } from "@brains/app";

import type { EvalHandlerRegistry } from "./eval-handler-registry";
import { bootEvalApp, prepareEvalEnvironment } from "./eval-environment";

interface BuildEvalDatabaseOptions {
  config: AppConfig;
  evalHandlerRegistry: EvalHandlerRegistry;
  brainModelPath?: string | undefined;
  cloneData: boolean;
}

export async function buildEvalDatabase(
  options: BuildEvalDatabaseOptions,
): Promise<void> {
  const evalDbBase = prepareEvalEnvironment({
    brainModelPath: options.brainModelPath,
    cloneData: options.cloneData,
    suffix: "build-db",
  });

  removeStaleBuiltDatabases(evalDbBase);

  const app = await bootEvalApp({
    evalDbBase,
    config: options.config,
    evalHandlerRegistry: options.evalHandlerRegistry,
  });
  const shell = app.getShell();

  await waitForJobsToDrain(shell.getJobQueueService());
  await verifyDatabaseContents(shell.getEntityService());
  await shell.shutdown();
  await checkpointDatabases(evalDbBase);
  copyBuiltDatabases(evalDbBase);
}

function removeStaleBuiltDatabases(evalDbBase: string): void {
  for (const staleDb of [
    `${evalDbBase}-data/brain.db`,
    `${evalDbBase}-data/embeddings.db`,
  ]) {
    if (existsSync(staleDb)) rmSync(staleDb);
  }
}

async function waitForJobsToDrain(jobQueue: {
  getActiveJobs(): Promise<Array<{ type: string }>>;
}): Promise<void> {
  console.log("Waiting for jobs to drain...");

  for (;;) {
    const active = await jobQueue.getActiveJobs();
    if (active.length === 0) break;

    const byType: Record<string, number> = {};
    for (const job of active) {
      byType[job.type] = (byType[job.type] ?? 0) + 1;
    }
    console.log(
      `  ${active.length} jobs: ${Object.entries(byType)
        .map(([type, count]) => `${type}(${count})`)
        .join(" ")}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function verifyDatabaseContents(entityService: {
  getEntityTypes(): string[];
  listEntities(request: { entityType: string }): Promise<unknown[]>;
}): Promise<void> {
  const counts: Record<string, number> = {};

  for (const type of entityService.getEntityTypes()) {
    const entities = await entityService.listEntities({ entityType: type });
    if (entities.length > 0) counts[type] = entities.length;
  }
  console.log("Database contents:", counts);

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    console.error("No entities found — sync failed.");
    process.exit(1);
  }
}

async function checkpointDatabases(evalDbBase: string): Promise<void> {
  const { Database } = await import("bun:sqlite");
  for (const dbPath of [`${evalDbBase}.db`, `${evalDbBase}-embeddings.db`]) {
    const db = new Database(dbPath);
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
  }
}

function copyBuiltDatabases(evalDbBase: string): void {
  const evalContentDir = resolvePath(process.cwd(), "eval-content");
  if (!existsSync(evalContentDir)) {
    console.error("No eval-content directory found");
    process.exit(1);
  }

  const databasePairs = [
    { source: `${evalDbBase}.db`, output: "brain.db" },
    { source: `${evalDbBase}-embeddings.db`, output: "embeddings.db" },
  ];

  for (const { source, output } of databasePairs) {
    const outputPath = resolvePath(evalContentDir, output);
    copyFileSync(source, outputPath);
    console.log(`Saved eval database to ${outputPath}`);
  }
}
