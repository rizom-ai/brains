import {
  base64AssetSource,
  OfflineBinaryMigrator,
  readBinaryAssetInventory,
  readInlineBinaryRow,
  type BinaryAssetInventory,
  type OfflineEntityConnection,
} from "@brains/entity-service";
import {
  classifyInlineImage,
  inlineImagePayload,
  LEGACY_PENDING_IMAGE_PLACEHOLDER,
} from "@brains/image";
import type { InlineImageBlocker } from "@brains/image";

/** What happened to one inline image; never its bytes. */
export type MigrationManifestEntry =
  | {
      id: string;
      outcome: "migrated";
      oldContentHash: string;
      newContentHash: string;
      digest: string;
      mediaType: string;
      sizeBytes: number;
    }
  | { id: string; outcome: "changed"; oldContentHash: string }
  | { id: string; outcome: "cleared"; oldContentHash: string }
  | {
      id: string;
      outcome: "blocked";
      reason: InlineImageBlocker;
      oldContentHash: string;
    };

/**
 * Migrate every inline image, one row at a time: each is decoded, staged in
 * committed chunks and published with its row in one transaction. Rows
 * already migrated are no longer inline, so a rerun skips them. Each
 * finished row is appended to `entries` as it commits, so a run that throws
 * still leaves the record of what it changed.
 */
export async function runImageAssetMigration(
  connection: OfflineEntityConnection,
  entries: MigrationManifestEntry[] = [],
): Promise<MigrationManifestEntry[]> {
  const inventory = await readBinaryAssetInventory(
    connection.client,
    "image",
    LEGACY_PENDING_IMAGE_PLACEHOLDER,
  );
  if (!(await hasFullTextIndex(connection))) {
    return migrateRows(connection, inventory, entries, false);
  }
  const restore = await suspendFullTextMerges(connection);
  try {
    return await migrateRows(connection, inventory, entries, true);
  } finally {
    await restore();
  }
}

async function migrateRows(
  connection: OfflineEntityConnection,
  inventory: BinaryAssetInventory,
  entries: MigrationManifestEntry[],
  fullText: boolean,
): Promise<MigrationManifestEntry[]> {
  const migrator = new OfflineBinaryMigrator(connection);
  for (const [index, id] of inventory.inlineIds.entries()) {
    if (fullText && index > 0 && index % COMPACT_EVERY_ROWS === 0) {
      await compactFullText(connection);
    }
    // Each row decodes up to the write cap; collecting before the next keeps
    // peak memory flat however many images the database holds.
    Bun.gc(true);
    const row = await readInlineBinaryRow(
      connection.client,
      "image",
      id,
      LEGACY_PENDING_IMAGE_PLACEHOLDER,
    );
    if (!row) continue;
    const verdict = classifyInlineImage(row.content);
    const payload = inlineImagePayload(row.content);
    if (verdict.status === "blocked" || payload === undefined) {
      entries.push({
        id,
        outcome: "blocked",
        reason: verdict.status === "blocked" ? verdict.reason : "malformed",
        oldContentHash: row.contentHash,
      });
      continue;
    }
    const { digest, sizeBytes, ...facts } = verdict;
    const result = await migrator.migrateRow("image", {
      id,
      expectedContentHash: row.contentHash,
      bytes: base64AssetSource(payload),
      expectedSize: sizeBytes,
      metadata: {
        format: facts.format,
        mediaType: facts.mediaType,
        width: facts.width,
        height: facts.height,
        sizeBytes,
      },
    });
    entries.push(
      result.outcome === "migrated"
        ? {
            id,
            outcome: "migrated",
            oldContentHash: row.contentHash,
            newContentHash: result.contentHash,
            digest,
            mediaType: facts.mediaType,
            sizeBytes,
          }
        : { id, outcome: "changed", oldContentHash: row.contentHash },
    );
  }
  // Pending or failed images have no bytes to migrate; one still holding
  // the old 1x1 placeholder keeps nothing instead.
  for (const id of inventory.placeholderIds) {
    const oldContentHash = await readContentHash(connection, id);
    if (oldContentHash === undefined) continue;
    const result = await migrator.clearPlaceholder("image", {
      id,
      expectedContentHash: oldContentHash,
    });
    entries.push({ id, outcome: result.outcome, oldContentHash });
  }
  if (fullText) await compactFullText(connection);
  return entries;
}

async function readContentHash(
  connection: OfflineEntityConnection,
  id: string,
): Promise<string | undefined> {
  const result = await connection.client.execute({
    sql: "SELECT contentHash FROM entities WHERE entityType = 'image' AND id = ?",
    args: [id],
  });
  const value = result.rows[0]?.["contentHash"];
  return typeof value === "string" ? value : undefined;
}

/*
 * Removing an inline row from the full-text index writes delete markers
 * about as large as the row's tokenized data URL. FTS5 normally folds such
 * segments into earlier ones as it writes (automerge) and, at a crisis
 * threshold, merges a whole level in one write; either makes one row's
 * transaction carry earlier rows' work. The run holds both off, so a row
 * writes only its own markers, and folds the segments away in small,
 * separately committed merge steps: the write-ahead log holds one row or
 * one step at a time, where a single `optimize` holds the whole rewrite.
 */

/** FTS5 caps a level below 2,000 segments; compaction runs long before. */
const SUSPENDED_CRISIS_MERGE = 1999;
const COMPACT_EVERY_ROWS = 500;
/** Leaf pages one merge step may write; negative merges across levels. */
const MERGE_STEP_PAGES = -16;
const SUSPENDED_MERGES: Record<string, number> = {
  automerge: 0,
  crisismerge: SUSPENDED_CRISIS_MERGE,
};

async function hasFullTextIndex(
  connection: OfflineEntityConnection,
): Promise<boolean> {
  const table = await connection.client.execute(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'entity_fts'",
  );
  return Number(table.rows[0]?.["count"]) > 0;
}

/**
 * Hold automatic merges off; the returned function puts the index's own
 * settings back. A setting at its suspended value is one an interrupted run
 * left behind, never the brain's own, so restoring removes it.
 */
async function suspendFullTextMerges(
  connection: OfflineEntityConnection,
): Promise<() => Promise<void>> {
  const stored = await connection.client.execute(
    "SELECT k, v FROM entity_fts_config WHERE k IN ('automerge', 'crisismerge')",
  );
  const original = new Map(
    stored.rows
      .map((row) => [String(row["k"]), Number(row["v"])] as const)
      .filter(([key, value]) => SUSPENDED_MERGES[key] !== value),
  );
  const set = (key: string, value: number): Promise<unknown> =>
    connection.client.execute({
      // FTS5 takes the setting's name only from the statement, and its
      // value only as an integer: a plain number binds as a real.
      sql: `INSERT INTO entity_fts(entity_fts, rank) VALUES('${key}', ?)`,
      args: [BigInt(value)],
    });
  for (const [key, value] of Object.entries(SUSPENDED_MERGES)) {
    await set(key, value);
  }
  return async () => {
    for (const key of Object.keys(SUSPENDED_MERGES)) {
      const value = original.get(key);
      await (value === undefined
        ? connection.client.execute({
            sql: "DELETE FROM entity_fts_config WHERE k = ?",
            args: [key],
          })
        : set(key, value));
    }
  };
}

/**
 * Merge the index's segments into one, a bounded step per transaction,
 * until a step changes nothing (fewer than two changes, per FTS5).
 */
async function compactFullText(
  connection: OfflineEntityConnection,
): Promise<void> {
  const before = await totalChanges(connection);
  await connection.client.execute({
    sql: "INSERT INTO entity_fts(entity_fts, rank) VALUES('merge', ?)",
    args: [BigInt(MERGE_STEP_PAGES)],
  });
  if ((await totalChanges(connection)) - before >= 2) {
    await compactFullText(connection);
  }
}

async function totalChanges(
  connection: OfflineEntityConnection,
): Promise<number> {
  const result = await connection.client.execute(
    "SELECT total_changes() AS count",
  );
  return Number(result.rows[0]?.["count"]);
}
