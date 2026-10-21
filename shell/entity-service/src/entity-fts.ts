import { sql } from "drizzle-orm";
import type { EntityDB } from "./db";

/** Anything that runs a statement: the database or an open transaction. */
type FtsWriter = Pick<EntityDB, "run">;

/**
 * Index an entity's content for keyword search. Its row's rowid comes from
 * `entity_fts_rowids`, so the row is found again by rowid: an FTS5 table finds
 * rows only that way, and a filter on its other columns reads the whole index.
 */
export async function insertEntityFts(
  database: FtsWriter,
  entityType: string,
  entityId: string,
  content: string,
): Promise<void> {
  await database.run(
    sql`INSERT OR IGNORE INTO entity_fts_rowids (entity_type, entity_id) VALUES (${entityType}, ${entityId})`,
  );
  await database.run(
    sql`INSERT INTO entity_fts (rowid, entity_id, entity_type, content)
        SELECT fts_rowid, ${entityId}, ${entityType}, ${content}
        FROM entity_fts_rowids
        WHERE entity_type = ${entityType} AND entity_id = ${entityId}`,
  );
}

/** Remove an entity's keyword-search row through its rowid. */
export async function deleteEntityFts(
  database: FtsWriter,
  entityType: string,
  entityId: string,
): Promise<void> {
  await database.run(
    sql`DELETE FROM entity_fts WHERE rowid IN (
          SELECT fts_rowid FROM entity_fts_rowids
          WHERE entity_type = ${entityType} AND entity_id = ${entityId}
        )`,
  );
  await database.run(
    sql`DELETE FROM entity_fts_rowids WHERE entity_type = ${entityType} AND entity_id = ${entityId}`,
  );
}
