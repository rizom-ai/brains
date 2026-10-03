import type { Client } from "@libsql/client";
import type { SqliteConnection } from "@brains/db";
import { ASSET_REF_PREFIX } from "@brains/assets";
import { z } from "@brains/utils/zod";
import { createEntityDatabase } from "../db";

/** A local entity database opened for offline maintenance. */
export type OfflineEntityConnection = SqliteConnection;

/** The statement surface an offline reader needs; nothing here writes. */
export type OfflineReader = Pick<Client, "execute">;

/** What an asset-backed type still stores inline, and what it already holds. */
export interface BinaryAssetInventory {
  /** Completed rows whose content is anything but an asset reference, by id. */
  inlineIds: string[];
  /** Pending or failed rows without bytes: empty, or the old placeholder. */
  awaitingIds: string[];
  /** Awaiting rows still holding the old pending placeholder. */
  placeholderIds: string[];
  /** Rows already holding an asset reference. */
  referenceCount: number;
  /** Full-text rows the type still has; asset-backed types keep none. */
  ftsRows: number;
  /** Digests already published as assets. */
  storedDigests: Set<string>;
}

const inlineRowSchema: z.ZodObject<{
  id: z.ZodString;
  content: z.ZodString;
  contentHash: z.ZodString;
}> = z.object({
  id: z.string(),
  content: z.string(),
  contentHash: z.string(),
});

/** One row an asset-backed type still stores inline. */
export type InlineBinaryRow = z.output<typeof inlineRowSchema>;

const idRowSchema = z.object({ id: z.string() });
const countRowSchema = z.object({ count: z.number() });
const awaitingRowSchema = z.object({ id: z.string(), placeholder: z.number() });
const digestRowSchema = z.object({ digest: z.string() });

/** Rows whose bytes do not exist yet, by their recorded ingestion status. */
const AWAITING_STATUS_SQL =
  "COALESCE(json_extract(metadata, '$.status'), '') IN ('pending', 'failed')";

/** Content without surrounding whitespace; SQLite's bare trim() keeps newlines. */
const TRIMMED = "trim(content, char(32, 9, 10, 13))";

/**
 * Awaiting rows that hold no bytes: empty, or exactly the old pending
 * placeholder (alone, or behind a stored visibility header). An awaiting row
 * with any other content keeps real bytes and migrates like an inline row.
 */
function bytelessAwaiting(placeholder: string | undefined): {
  sql: string;
  args: string[];
} {
  if (placeholder === undefined) {
    return { sql: `(${AWAITING_STATUS_SQL} AND content = '')`, args: [] };
  }
  return {
    sql: `(${AWAITING_STATUS_SQL} AND (content = '' OR ${TRIMMED} = ? OR (content LIKE '---%' AND substr(${TRIMMED}, -length(?)) = ?)))`,
    args: [placeholder, placeholder, placeholder],
  };
}

/**
 * Inventory an asset-backed type offline: the inline rows still to migrate,
 * the rows already migrated, the full-text rows to remove and the digests
 * already stored. Only ids are listed, so payloads load one row at a time.
 * `placeholder` is the type's old pending payload, which holds no real bytes.
 */
export async function readBinaryAssetInventory(
  reader: OfflineReader,
  entityType: string,
  placeholder?: string,
): Promise<BinaryAssetInventory> {
  const referencePattern = `${ASSET_REF_PREFIX}%`;
  const byteless = bytelessAwaiting(placeholder);
  const [inline, awaiting, references, ftsRows, digests] = await Promise.all([
    reader.execute({
      sql: `SELECT id FROM entities WHERE entityType = ? AND content NOT LIKE ? AND NOT ${byteless.sql} ORDER BY id`,
      args: [entityType, referencePattern, ...byteless.args],
    }),
    reader.execute({
      sql: `SELECT id, content <> '' AS placeholder FROM entities WHERE entityType = ? AND ${byteless.sql} ORDER BY id`,
      args: [entityType, ...byteless.args],
    }),
    reader.execute({
      sql: "SELECT COUNT(*) AS count FROM entities WHERE entityType = ? AND content LIKE ?",
      args: [entityType, referencePattern],
    }),
    countFtsRows(reader, entityType),
    reader.execute("SELECT digest FROM assets"),
  ]);
  const awaitingRows = awaiting.rows.map((row) => awaitingRowSchema.parse(row));
  return {
    inlineIds: inline.rows.map((row) => idRowSchema.parse(row).id),
    awaitingIds: awaitingRows.map((row) => row.id),
    placeholderIds: awaitingRows
      .filter((row) => row.placeholder === 1)
      .map((row) => row.id),
    referenceCount: countRowSchema.parse(references.rows[0]).count,
    ftsRows,
    storedDigests: new Set(
      digests.rows.map((row) => digestRowSchema.parse(row).digest),
    ),
  };
}

/**
 * Open a local entity database for offline maintenance, while the app is
 * stopped. Close its client when done.
 */
export function openOfflineEntityDatabase(
  path: string,
): OfflineEntityConnection {
  return createEntityDatabase({ url: `file:${path}` });
}

/** The type's full-text rows; a database that never started has no index. */
async function countFtsRows(
  reader: OfflineReader,
  entityType: string,
): Promise<number> {
  const table = await reader.execute(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'entity_fts'",
  );
  if (countRowSchema.parse(table.rows[0]).count === 0) return 0;
  const rows = await reader.execute({
    sql: "SELECT COUNT(*) AS count FROM entity_fts WHERE entity_type = ?",
    args: [entityType],
  });
  return countRowSchema.parse(rows.rows[0]).count;
}

/** One inline row, or null once it holds an asset reference. */
export async function readInlineBinaryRow(
  reader: OfflineReader,
  entityType: string,
  id: string,
  placeholder?: string,
): Promise<InlineBinaryRow | null> {
  const byteless = bytelessAwaiting(placeholder);
  const result = await reader.execute({
    sql: `SELECT id, content, contentHash FROM entities WHERE entityType = ? AND id = ? AND content NOT LIKE ? AND NOT ${byteless.sql}`,
    args: [entityType, id, `${ASSET_REF_PREFIX}%`, ...byteless.args],
  });
  const row = result.rows[0];
  return row ? inlineRowSchema.parse(row) : null;
}
