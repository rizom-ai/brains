#!/usr/bin/env bun
import {
  refuseDirectMigrationRun,
  resolveMigrationsFolder,
  runPackageMigrations,
} from "@brains/db";
import { ensureFtsTable } from "./db";
import { assets } from "./schema/assets";
import { entities } from "./schema/entities";
import {
  projectionDirtyInputs,
  projectionIncidents,
  projectionRuleMemos,
  projectionWaveInputs,
  projectionWaveRules,
  projectionWaves,
} from "./schema/projection-state";
import type { EntityDbConfig } from "./types";
import type { Logger } from "@brains/utils/logger";

export async function migrateEntities(
  config: EntityDbConfig,
  logger?: Logger,
): Promise<void> {
  await runPackageMigrations({
    label: "entity",
    config,
    schema: {
      assets,
      entities,
      projectionDirtyInputs,
      projectionWaves,
      projectionIncidents,
      projectionWaveInputs,
      projectionWaveRules,
      projectionRuleMemos,
    },
    migrationsFolder: resolveMigrationsFolder(
      import.meta.url,
      "entity-service",
    ),
    authTokenEnv: "DATABASE_AUTH_TOKEN",
    logger,
    // Engine-specific full-text indexes are not managed by Drizzle.
    afterMigrate: ensureFtsTable,
  });
}

// Migration scripts should only be called from app contexts,
// not run directly. Use your app's migration script instead.
if (import.meta.main) {
  refuseDirectMigrationRun();
}
