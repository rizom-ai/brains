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
    config: options.config,
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
  const entityService = shell.getEntityService();
  let buildFailure: unknown;
  let buildFailed = false;

  try {
    await waitForJobsToDrain(shell.getJobQueueService());
    await waitForIndexReadiness(entityService);
    await verifyDatabaseContents(entityService);
  } catch (error) {
    buildFailed = true;
    buildFailure = error;
  }

  let shutdownFailure: unknown;
  let shutdownFailed = false;
  try {
    await app.stop();
  } catch (error) {
    shutdownFailed = true;
    shutdownFailure = error;
  }

  if (buildFailed) {
    if (shutdownFailed) {
      console.error(
        "Failed to stop eval app after build failure:",
        shutdownFailure,
      );
    }
    throw buildFailure;
  }
  if (shutdownFailed) throw shutdownFailure;

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

async function waitForIndexReadiness(entityService: {
  awaitIndexReady(options: { timeoutMs: number }): Promise<{
    ready: boolean;
    degraded: boolean;
    activeEmbeddingJobs: number;
    missingEmbeddings: number;
    staleEmbeddings: number;
    failedEmbeddings: number;
  }>;
}): Promise<void> {
  console.log("Waiting for semantic index readiness...");
  const status = await entityService.awaitIndexReady({ timeoutMs: 120_000 });

  if (!status.ready) {
    throw new Error(`Semantic index was not ready: ${JSON.stringify(status)}`);
  }

  if (status.degraded) {
    console.warn("Semantic index ready with degraded embeddings:", status);
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
    throw new Error("No entities found — sync failed.");
  }
}

async function checkpointDatabases(evalDbBase: string): Promise<void> {
  const { Database } = await import("bun:sqlite");
  for (const dbPath of [`${evalDbBase}.db`, `${evalDbBase}-embeddings.db`]) {
    const db = new Database(dbPath);
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      db.close();
    }
  }
}

function copyBuiltDatabases(evalDbBase: string): void {
  const evalContentDir = resolvePath(process.cwd(), "eval-content");
  if (!existsSync(evalContentDir)) {
    throw new Error("No eval-content directory found");
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
