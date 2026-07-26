#!/usr/bin/env bun
import {
  refuseDirectMigrationRun,
  resolveMigrationsFolder,
  runPackageMigrations,
} from "@brains/db";
import type { Logger } from "@brains/utils/logger";
import { runtimeStateRecords } from "./schema/runtime-state";
import type { RuntimeStateDbConfig } from "./types";

export async function migrateRuntimeState(
  config: RuntimeStateDbConfig,
  logger?: Logger,
): Promise<void> {
  await runPackageMigrations({
    label: "runtime-state",
    config,
    schema: { runtimeStateRecords },
    migrationsFolder: resolveMigrationsFolder(import.meta.url, "runtime-state"),
    authTokenEnv: "RUNTIME_STATE_DATABASE_AUTH_TOKEN",
    logger,
  });
}

if (import.meta.main) {
  refuseDirectMigrationRun();
}
