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
  return sql.join(
    terms.map((term) => sql`instr(${entities.searchText}, ${term}) > 0`),
    sql` AND `,
  );
}

/** Fraction of normalized query terms present in an entity's search text. */
export function buildKeywordScore(query: string): SQL<number> {
  const terms = keywordTerms(query);
  if (terms.length === 0) return sql<number>`0.0`;
  const matches = terms.map(
    (term) =>
      sql`CASE WHEN instr(${entities.searchText}, ${term}) > 0 THEN 1.0 ELSE 0.0 END`,
  );
  return sql<number>`(${sql.join(matches, sql` + `)}) / ${terms.length}`;
}

/**
 * Type for the entity database
 */
export type EntityDatabase = SqliteConnection;
