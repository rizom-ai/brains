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
  });
}

/** Normalize text identically for durable rows and incoming queries. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordTerms(query: string): string[] {
  return [...new Set(normalizeSearchText(query).split(" ").filter(Boolean))];
}

/** Require every normalized query term as a portable substring match. */
export function buildKeywordMatch(query: string): SQL {
  const terms = keywordTerms(query);
  if (terms.length === 0) return sql`0 = 1`;
  // A bound term table keeps both expression depth and argument count fixed.
  return sql`NOT EXISTS (
    SELECT 1 FROM json_each(${JSON.stringify(terms)}) AS keyword_terms
    WHERE coalesce(instr(${entities.searchText}, keyword_terms.value), 0) = 0
  )`;
}

/** Fraction of normalized query terms present in an entity's search text. */
export function buildKeywordScore(query: string): SQL<number> {
  const terms = keywordTerms(query);
  if (terms.length === 0) return sql<number>`0.0`;
  return sql<number>`(
    SELECT avg(CASE WHEN instr(${entities.searchText}, keyword_terms.value) > 0
      THEN 1.0 ELSE 0.0 END)
    FROM json_each(${JSON.stringify(terms)}) AS keyword_terms
  )`;
}

/**
 * Type for the entity database
 */
export type EntityDatabase = SqliteConnection;
