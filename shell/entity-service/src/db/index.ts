import {
  createSqliteDatabase,
  type PragmaClient,
  type SqliteConnection,
  type SqliteDatabase,
} from "@brains/db";
import { assets } from "../schema/assets";
import { entities } from "../schema/entities";
import { entityMutationReceipts } from "../schema/entity-mutation-receipts";
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
      entityMutationReceipts,
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
  await client.execute(`
    CREATE TABLE IF NOT EXISTS entity_fts_rowids (
      fts_rowid INTEGER PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      UNIQUE (entity_type, entity_id)
    )
  `);
  // Rows written before the mapping existed, or by an older runtime while
  // this one started, are mapped; an entity's other rows are duplicates its
  // deletes could never reach, and go. Each step can run again.
  await client.execute(`
    INSERT OR IGNORE INTO entity_fts_rowids (fts_rowid, entity_type, entity_id)
    SELECT max(rowid), entity_type, entity_id FROM entity_fts
    WHERE NOT EXISTS (
      SELECT 1 FROM entity_fts_rowids AS mapped
      WHERE mapped.entity_type = entity_fts.entity_type
        AND mapped.entity_id = entity_fts.entity_id
    )
    GROUP BY entity_type, entity_id
  `);
  await client.execute(
    "DELETE FROM entity_fts WHERE rowid NOT IN (SELECT fts_rowid FROM entity_fts_rowids)",
  );
  await client.execute(
    "UPDATE OR IGNORE entity_fts_rowids SET entity_type = 'note' WHERE entity_type = 'base'",
  );
  await client.execute(
    "UPDATE entity_fts SET entity_type = 'note' WHERE entity_type = 'base'",
  );
}

/**
 * Type for the entity database
 */
export type EntityDatabase = SqliteConnection;
