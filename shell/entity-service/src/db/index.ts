import {
  createSqliteDatabase,
  type PragmaClient,
  type SqliteConnection,
  type SqliteDatabase,
  type SqliteEngine,
} from "@brains/db";
import { assets } from "../schema/assets";
import { entities } from "../schema/entities";
import { entityExportIntents } from "../schema/entity-export-state";
import {
  projectionDirtyInputs,
  projectionEntityOwners,
  projectionIncidents,
  projectionRuleMemos,
  projectionWaveInputs,
  projectionWaveRules,
  projectionWaves,
} from "../schema/projection-state";
import type { DbConfig as EntityDbConfig } from "@brains/contracts";
import { sql, type SQL } from "drizzle-orm";

export type EntityDB = SqliteDatabase;

/** Search-only entity database surface. It cannot start a transaction and
 * therefore cannot replace the connection that owns the `emb` attachment. */
export type EntitySearchDB = Pick<EntityDB, "select">;

/**
 * Create an entity database connection
 * Config is now required - use createShellServiceConfig() for standard paths
 */
export function createEntityDatabase(config: EntityDbConfig): SqliteConnection {
  return createSqliteDatabase({
    url: config.url,
    schema: {
      assets,
      entities,
      entityExportIntents,
      projectionDirtyInputs,
      projectionEntityOwners,
      projectionWaves,
      projectionIncidents,
      projectionWaveInputs,
      projectionWaveRules,
      projectionRuleMemos,
    },
    authToken: config.authToken,
    authTokenEnv: "DATABASE_AUTH_TOKEN",
  });
}

/** Ensure the engine-specific full-text index used for keyword boosting. */
export async function ensureFtsTable(
  client: PragmaClient,
  engine: SqliteEngine = "libsql",
): Promise<void> {
  if (engine === "turso") {
    await client.execute(`
      CREATE INDEX IF NOT EXISTS entities_content_fts
      ON entities USING fts (content)
    `);
    return;
  }

  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS entity_fts USING fts5(
      entity_id UNINDEXED,
      entity_type UNINDEXED,
      content
    )
  `);
  await client.execute(
    "UPDATE entity_fts SET entity_type = 'note' WHERE entity_type = 'base'",
  );
}

/** Build the engine-specific predicate for an exact keyword boost decision. */
export function buildFtsMatch(engine: SqliteEngine, ftsQuery: string): SQL {
  if (engine === "turso") {
    return sql`EXISTS (
      SELECT 1 FROM entities AS fts_entities
      WHERE fts_entities.content MATCH ${ftsQuery}
        AND fts_entities.id = ${entities.id}
        AND fts_entities.entityType = ${entities.entityType}
    )`;
  }

  return sql`EXISTS (
    SELECT 1 FROM entity_fts WHERE entity_fts MATCH ${ftsQuery}
      AND entity_id = ${entities.id} AND entity_type = ${entities.entityType}
  )`;
}

/** Delete a libSQL FTS5 shadow row; Turso's native index tracks entities. */
export async function deleteFtsEntry(
  database: Pick<EntityDB, "run">,
  engine: SqliteEngine,
  entityId: string,
  entityType: string,
): Promise<void> {
  if (engine === "turso") return;
  await database.run(
    sql`DELETE FROM entity_fts WHERE entity_id = ${entityId} AND entity_type = ${entityType}`,
  );
}

/** Upsert a libSQL FTS5 shadow row; Turso's native index tracks entities. */
export async function upsertFtsEntry(
  database: Pick<EntityDB, "run">,
  engine: SqliteEngine,
  entityId: string,
  entityType: string,
  content: string,
): Promise<void> {
  if (engine === "turso") return;
  await deleteFtsEntry(database, engine, entityId, entityType);
  await database.run(
    sql`INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (${entityId}, ${entityType}, ${content})`,
  );
}

/**
 * Type for the entity database
 */
export type EntityDatabase = SqliteConnection;
