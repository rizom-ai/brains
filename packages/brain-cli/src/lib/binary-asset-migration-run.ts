import {
  base64AssetSource,
  OfflineBinaryMigrator,
  readBinaryAssetInventory,
  readInlineBinaryRow,
  type BinaryAssetInventory,
  type OfflineEntityConnection,
} from "@brains/entity-service";
import type { BinaryAssetKind, InlineBlocker } from "./binary-asset-kinds";

/** What happened to one inline row; never its bytes. */
export type MigrationManifestEntry = { entityType: string; id: string } & (
  | {
      outcome: "migrated";
      oldContentHash: string;
      newContentHash: string;
      digest: string;
      mediaType: string;
      sizeBytes: number;
    }
  | { outcome: "changed"; oldContentHash: string }
  | { outcome: "cleared"; oldContentHash: string }
  | { outcome: "blocked"; reason: InlineBlocker; oldContentHash: string }
);

/**
 * Migrate every inline row of each type, one row at a time: each is
 * decoded, staged in committed chunks and published with its row in one
 * transaction. Rows already migrated are no longer inline, so a rerun skips
 * them. Each finished row is appended to `entries` as it commits, so a run
 * that throws still leaves the record of what it changed.
 */
export async function runBinaryAssetMigration(
  connection: OfflineEntityConnection,
  kinds: readonly BinaryAssetKind[],
  entries: MigrationManifestEntry[] = [],
): Promise<MigrationManifestEntry[]> {
  const fullText = await hasFullTextIndex(connection);
  const restore = fullText
    ? await suspendFullTextMerges(connection)
    : undefined;
  try {
    for (const kind of kinds) {
      const inventory = await readBinaryAssetInventory(
        connection.client,
        kind.entityType,
        kind.placeholder,
      );
      await migrateRows(connection, kind, inventory, entries, fullText);
    }
    return entries;
  } finally {
    await restore?.();
  }
}

async function migrateRows(
  connection: OfflineEntityConnection,
  kind: BinaryAssetKind,
  inventory: BinaryAssetInventory,
  entries: MigrationManifestEntry[],
  fullText: boolean,
): Promise<void> {
  const { entityType } = kind;
  const migrator = new OfflineBinaryMigrator(connection);
  for (const [index, id] of inventory.inlineIds.entries()) {
    if (fullText && index > 0 && index % COMPACT_EVERY_ROWS === 0) {
      await compactFullText(connection);
    }
    // Each row decodes up to the write cap; collecting before the next keeps
    // peak memory flat however many rows the database holds.
    Bun.gc(true);
    const row = await readInlineBinaryRow(
      connection.client,
      entityType,
      id,
      kind.placeholder,
    );
    if (!row) continue;
    const verdict = kind.classify(row.content);
    const payload = kind.payload(row.content);
    if (verdict.status === "blocked" || payload === undefined) {
      entries.push({
        entityType,
        id,
        outcome: "blocked",
        reason: verdict.status === "blocked" ? verdict.reason : "malformed",
        oldContentHash: row.contentHash,
      });
      continue;
    }
    const result = await migrator.migrateRow(entityType, {
      id,
      expectedContentHash: row.contentHash,
      bytes: base64AssetSource(payload),
      expectedSize: verdict.sizeBytes,
      metadata: verdict.metadata,
    });
    entries.push(
      result.outcome === "migrated"
        ? {
            entityType,
            id,
            outcome: "migrated",
            oldContentHash: row.contentHash,
            newContentHash: result.contentHash,
            digest: verdict.digest,
            mediaType: verdict.mediaType,
            sizeBytes: verdict.sizeBytes,
          }
        : {
            entityType,
            id,
            outcome: "changed",
            oldContentHash: row.contentHash,
          },
    );
  }
  // Pending or failed rows have no bytes to migrate; one still holding the
  // old placeholder keeps nothing instead.
  for (const id of inventory.placeholderIds) {
    const oldContentHash = await readContentHash(connection, entityType, id);
    if (oldContentHash === undefined) continue;
    const result = await migrator.clearPlaceholder(entityType, {
      id,
      expectedContentHash: oldContentHash,
    });
    entries.push({ entityType, id, outcome: result.outcome, oldContentHash });
  }
  if (fullText) await compactFullText(connection);
}

async function readContentHash(
  connection: OfflineEntityConnection,
  entityType: string,
  id: string,
): Promise<string | undefined> {
  const result = await connection.client.execute({
    sql: "SELECT contentHash FROM entities WHERE entityType = ? AND id = ?",
    args: [entityType, id],
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
