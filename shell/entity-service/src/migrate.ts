#!/usr/bin/env bun
import {
  closeSqliteClient,
  createSqliteDatabase,
  refuseDirectMigrationRun,
  resolveMigrationsFolder,
  resolveSqliteEngine,
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
    authToken: config.authToken,
    authTokenEnv: "DATABASE_AUTH_TOKEN",
    engine: "turso",
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
  engine?: "libsql" | "turso",
): Promise<void> {
  return runPackageMigrations({
    label: "entity",
    config,
    ...(engine && { engine }),
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
    authTokenEnv: "DATABASE_AUTH_TOKEN",
    logger,
  });
}

export async function migrateEntities(
  config: EntityDbConfig,
  logger?: Logger,
): Promise<void> {
  // Turso cannot remove a legacy FTS5 virtual table it cannot load. For that
  // pre-0012 schema only, execute the generated migration through libSQL.
  // Fresh and already-current Turso databases never open a libSQL connection.
  if (
    resolveSqliteEngine(config.url) === "turso" &&
    (await hasLegacyEntitySearchTable(config))
  ) {
    await runEntityMigrations(config, logger, "libsql");
  }
  await runEntityMigrations(config, logger);
}

// Migration scripts should only be called from app contexts,
// not run directly. Use your app's migration script instead.
if (import.meta.main) {
  refuseDirectMigrationRun();
}
