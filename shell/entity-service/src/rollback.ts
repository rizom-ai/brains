import { createSqliteDatabase, dropTursoIndexForFallback } from "@brains/db";
import type { EntityDbConfig } from "./types";

/**
 * Prepare a Turso-backed entity database for the explicit libSQL fallback.
 *
 * The application must be stopped before this runs. Turso's native FTS index
 * persists schema syntax that libSQL cannot parse, so it must be removed with
 * Turso first. The derived FTS5 shadow table is then rebuilt from `entities`.
 */
export async function prepareEntityDatabaseForLibsql(
  config: EntityDbConfig,
): Promise<void> {
  if (!config.url.startsWith("file:")) {
    throw new Error("The libSQL fallback preparation only supports file: urls");
  }

  await dropTursoIndexForFallback(config.url, "entities_content_fts");

  const libsql = createSqliteDatabase({
    url: config.url,
    schema: {},
    authToken: config.authToken,
    engine: "libsql",
  });
  try {
    await libsql.client.batch(
      [
        "DROP TABLE IF EXISTS entity_fts",
        `CREATE VIRTUAL TABLE entity_fts USING fts5(
          entity_id UNINDEXED,
          entity_type UNINDEXED,
          content
        )`,
        `INSERT INTO entity_fts (entity_id, entity_type, content)
         SELECT id, entityType, content FROM entities`,
      ],
      "write",
    );
  } finally {
    libsql.client.close();
  }
}
