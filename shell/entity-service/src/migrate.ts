#!/usr/bin/env bun
import {
  closeSqliteClient,
  createSqliteDatabase,
  refuseDirectMigrationRun,
  resolveMigrationsFolder,
  runPackageMigrations,
} from "@brains/db";
import { embeddings } from "./schema/embeddings";
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

/** Remove the FTS5 table created by released libSQL builds. */
export async function preparePortableEntitySearch(
  config: EntityDbConfig,
): Promise<void> {
  const { client } = createSqliteDatabase({
    url: config.url,
    schema: {},
    authToken: config.authToken,
    authTokenEnv: "DATABASE_AUTH_TOKEN",
    engine: "libsql",
  });

  try {
    await client.execute("DROP TABLE IF EXISTS entity_fts");
    await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    await closeSqliteClient(client);
  }
}

export async function migrateEntities(
  config: EntityDbConfig,
  logger?: Logger,
): Promise<void> {
  await preparePortableEntitySearch(config);

  await runPackageMigrations({
    label: "entity",
    config,
    schema: {
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

// Migration scripts should only be called from app contexts,
// not run directly. Use your app's migration script instead.
if (import.meta.main) {
  refuseDirectMigrationRun();
}
