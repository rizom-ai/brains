import { createSqliteDatabase, dropTursoIndexForFallback } from "@brains/db";
import type { EntityDbConfig } from "./types";

/**
 * Prepare a Turso-backed entity database for the explicit libSQL fallback.
 *
 * The application must be stopped before this runs. Historical Turso native
 * FTS schema is not parseable by libSQL, so it must be removed with Turso
 * first. Historical libSQL FTS5 schema is also removed; keyword boosting uses
 * the portable entities-table scan on both engines.
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
    await libsql.client.execute("DROP TABLE IF EXISTS entity_fts");
  } finally {
    libsql.client.close();
  }
}
