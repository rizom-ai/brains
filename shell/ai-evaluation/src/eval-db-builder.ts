import { copyFileSync, existsSync, rmSync } from "fs";
import { resolve as resolvePath } from "path";
import type { AppConfig } from "@brains/app";
import { internalFullScope, type IEntityService } from "@brains/plugins";

import type { EvalHandlerRegistry } from "./eval-handler-registry";
import {
  bootEvalApp,
  prepareEvalEnvironment,
  resolveEvaluationContentDirectory,
} from "./eval-environment";
import { waitForIndexReadiness, waitForJobsToDrain } from "./eval-settle";

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
  const evalContentDir = resolveEvaluationContentDirectory({
    brainModelPath: options.brainModelPath,
    config: options.config,
  });
  if (!evalContentDir) {
    throw new Error("No eval-content directory found");
  }
  copyBuiltDatabases(evalDbBase, evalContentDir);
}

function removeStaleBuiltDatabases(evalDbBase: string): void {
  const staleDb = `${evalDbBase}-data/brain.db`;
  if (existsSync(staleDb)) rmSync(staleDb);
}

async function verifyDatabaseContents(
  entityService: Pick<IEntityService, "getEntityTypes" | "listEntities">,
): Promise<void> {
  const counts: Record<string, number> = {};

  for (const type of entityService.getEntityTypes()) {
    const entities = await entityService.listEntities({
      entityType: type,
      options: {
        filter: {
          visibilityScope: internalFullScope(
            "eval database verification counts all visibility tiers",
          ),
        },
      },
    });
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
  const db = new Database(`${evalDbBase}.db`);
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}

export function copyBuiltDatabases(
  evalDbBase: string,
  evalContentDir: string,
): void {
  const outputPath = resolvePath(evalContentDir, "brain.db");
  copyFileSync(`${evalDbBase}.db`, outputPath);
  console.log(`Saved eval database to ${outputPath}`);
}
