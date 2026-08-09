#!/usr/bin/env bun
import {
  createSqliteDatabase,
  refuseDirectMigrationRun,
  resolveMigrationsFolder,
  resolveSqliteEngine,
  runPackageMigrations,
} from "@brains/db";
import { ensureFtsTable } from "./db";
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
): Promise<void> {
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
      return;
    }
    throw error;
  } finally {
    client.close();
  }
}

/** Remove libSQL-only schema before Turso opens existing local database files. */
export async function prepareEntityDatabasesForTurso(
  config: EntityDbConfig,
  embeddingConfig?: EntityDbConfig,
): Promise<void> {
  if (resolveSqliteEngine(config.url) === "turso") {
    await dropLibsqlSchemaObjects(
      config,
      [
        "DROP INDEX IF EXISTS embeddings_embedding_idx",
        "DROP TABLE IF EXISTS entity_fts",
      ],
      true,
    );
  }
  if (embeddingConfig && resolveSqliteEngine(embeddingConfig.url) === "turso") {
    await dropLibsqlSchemaObjects(embeddingConfig, [
      "DROP INDEX IF EXISTS embeddings_embedding_idx",
    ]);
  }
}

export async function migrateEntities(
  config: EntityDbConfig,
  logger?: Logger,
  embeddingConfig?: EntityDbConfig,
): Promise<void> {
  await prepareEntityDatabasesForTurso(config, embeddingConfig);

  await runPackageMigrations({
    label: "entity",
    config,
    schema: {
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
