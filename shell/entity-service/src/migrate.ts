#!/usr/bin/env bun
import {
  closeSqliteClient,
  createSqliteDatabase,
  refuseDirectMigrationRun,
  resolveMigrationsFolder,
  runPackageMigrations,
} from "@brains/db";
import { embeddings } from "./schema/embeddings";
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

async function hasLegacyEntitySearchTable(
  config: EntityDbConfig,
): Promise<boolean> {
  const { client } = createSqliteDatabase({
    url: config.url,
    schema: {},
  });
  try {
    const result = await client.execute(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'entity_fts' LIMIT 1",
    );
    return result.rows.length > 0;
  } finally {
    await closeSqliteClient(client);
  }
}

function runEntityMigrations(
  config: EntityDbConfig,
  logger: Logger | undefined,
): Promise<void> {
  return runPackageMigrations({
    label: "entity",
    config,
    schema: {
      assets,
      entities,
      embeddings,
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
    logger,
  });
}

export async function migrateEntities(
  config: EntityDbConfig,
  logger?: Logger,
): Promise<void> {
  // Released libSQL schemas belong to the offline import tool, never an
  // alternate runtime engine or an in-place cleanup during application boot.
  if (await hasLegacyEntitySearchTable(config)) {
    throw new Error(
      "Legacy libSQL entity database detected. Import the 0.2 backup into a new 0.3 data directory before starting this runtime.",
    );
  }
  await runEntityMigrations(config, logger);
}

// Migration scripts should only be called from app contexts,
// not run directly. Use your app's migration script instead.
if (import.meta.main) {
  refuseDirectMigrationRun();
}
