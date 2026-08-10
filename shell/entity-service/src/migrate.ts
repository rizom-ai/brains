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
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";

/**
 * Remove the FTS5 table created by released libSQL builds.
 *
 * This must run on libSQL: only libSQL can drop the fts5 virtual table and
 * the historical vector index its own era created (Turso has neither module). A
 * file whose WAL Turso is already coordinating is unreadable to libSQL and
 * reports SQLITE_CORRUPT — but such a file has necessarily been through this
 * cleanup before its first Turso open, so there is nothing left to remove
 * and the pass is skipped. Genuine corruption still fails loudly at the
 * migration step immediately after.
 */
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
    try {
      await client.execute("DROP TABLE IF EXISTS entity_fts");
      await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      await closeSqliteClient(client);
    }
  } catch (error) {
    if (!getErrorMessage(error).includes("SQLITE_CORRUPT")) throw error;
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

// Migration scripts should only be called from app contexts,
// not run directly. Use your app's migration script instead.
if (import.meta.main) {
  refuseDirectMigrationRun();
}
