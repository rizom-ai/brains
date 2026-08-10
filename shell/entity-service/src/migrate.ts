#!/usr/bin/env bun
import {
  createSqliteDatabase,
  dropTursoIndexForFallback,
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
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";

async function dropLibsqlSchemaObjects(
  config: EntityDbConfig,
  statements: string[],
  allowNativeFtsSchema = false,
): Promise<boolean> {
  const { client } = createSqliteDatabase({
    url: config.url,
    schema: {},
    authToken: config.authToken,
    authTokenEnv: "DATABASE_AUTH_TOKEN",
    engine: "libsql",
  });

  try {
    await client.batch(statements, "write");
    await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (error) {
    const message = getErrorMessage(error);
    if (
      allowNativeFtsSchema &&
      message.includes("malformed database schema") &&
      message.includes("__turso_internal_fts_")
    ) {
      return true;
    }
    throw error;
  } finally {
    client.close();
  }
  return false;
}

const historicalLibsqlSchemaCleanup = [
  "DROP INDEX IF EXISTS embeddings_embedding_idx",
  "DROP TABLE IF EXISTS entity_fts",
];

/**
 * Remove every historical engine-specific search object before the selected
 * engine opens the entity database. The second libSQL pass handles files that
 * were unreadable until Turso removed its native FTS schema.
 */
export async function preparePortableEntitySearch(
  config: EntityDbConfig,
): Promise<void> {
  if (!config.url.startsWith("file:")) {
    await dropLibsqlSchemaObjects(config, historicalLibsqlSchemaCleanup);
    return;
  }

  const hasNativeFts = await dropLibsqlSchemaObjects(
    config,
    historicalLibsqlSchemaCleanup,
    true,
  );
  if (hasNativeFts) {
    await dropTursoIndexForFallback(config.url, "entities_content_fts");
    await dropLibsqlSchemaObjects(config, historicalLibsqlSchemaCleanup);
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
