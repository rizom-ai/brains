import {
  createSqliteDatabase,
  type PragmaClient,
  type SqliteConnection,
  type SqliteDatabase,
} from "@brains/db";
import { entities } from "../schema/entities";
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
      entities,
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

/**
 * Create FTS5 virtual table for full-text keyword search on entity content.
 * Called during entity DB initialization alongside WAL mode setup.
 */
export async function ensureFtsTable(client: PragmaClient): Promise<void> {
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

/**
 * Type for the entity database
 */
export type EntityDatabase = SqliteConnection;
