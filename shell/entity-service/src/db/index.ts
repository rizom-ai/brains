import {
  createSqliteDatabase,
  type SqliteConnection,
  type SqliteDatabase,
} from "@brains/db";
import { embeddings } from "../schema/embeddings";
import { assets } from "../schema/assets";
import { entities } from "../schema/entities";
import { entityJobOutbox } from "../schema/entity-job-outbox";
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

/** Search-only entity database surface. */
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
      embeddings,
      entityJobOutbox,
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

/**
 * Build the portable case-insensitive exact-phrase predicate used for keyword
 * boosting. SQLite's lower() provides ASCII case folding; no search index or
 * engine-specific schema is involved.
 */
export function buildKeywordMatch(query: string): SQL {
  // instr(content, '') is 1 for every row, so an empty phrase would boost the
  // whole corpus and push results past a caller's minScore threshold.
  if (query.trim() === "") return sql`0 = 1`;
  return sql`instr(lower(${entities.content}), lower(${query})) > 0`;
}

/**
 * Type for the entity database
 */
export type EntityDatabase = SqliteConnection;
