import {
  readBinaryAssetInventory,
  readInlineBinaryRow,
  type OfflineReader,
} from "@brains/entity-service";
import type { BinaryAssetKind, InlineBlocker } from "./binary-asset-kinds";

/** One inline row that cannot become an asset as it is. */
export interface BlockedRow {
  id: string;
  reason: InlineBlocker;
  sizeBytes?: number;
}

/** Disk needed to back up, migrate and compact the entity database. */
export interface MigrationDiskEstimate {
  /** The database file and its WAL as they are now. */
  databaseBytes: number;
  /** The pre-migration snapshot is a full copy. */
  backupBytes: number;
  /** Migration adds the new asset chunks; freed pages stay until VACUUM. */
  afterMigrationBytes: number;
  /** VACUUM writes a compacted copy without the inline payloads. */
  vacuumBytes: number;
  /** Backup, migrated database and VACUUM copy at once. */
  peakBytes: number;
}

/** What migrating every inline row of one type to an asset would do. */
export interface BinaryAssetMigrationPlan {
  kind: BinaryAssetKind;
  inlineRows: number;
  ready: number;
  blocked: BlockedRow[];
  alreadyMigrated: number;
  /** Pending or failed rows: no bytes yet, so nothing to migrate. */
  awaitingRows: number;
  /** Awaiting rows still holding the old placeholder, to clear. */
  placeholdersToClear: number;
  /** Distinct bytes among the ready rows. */
  uniqueDigests: number;
  /** Ready rows whose bytes another ready row also carries. */
  duplicateRows: number;
  /** Distinct ready bytes already published as assets. */
  alreadyStoredDigests: number;
  /** New asset bytes: distinct ready bytes not yet stored. */
  bytesToStore: number;
  /** Inline content leaving the entities table. */
  inlineBytesFreed: number;
  ftsRows: number;
  contentHashChanges: number;
  disk: MigrationDiskEstimate;
}

/**
 * Plan one type's migration without writing: every inline row is decoded
 * and classified one at a time, and only its digest and size are kept.
 */
export async function planBinaryAssetMigration(
  reader: OfflineReader,
  kind: BinaryAssetKind,
  options: { databaseBytes: number },
): Promise<BinaryAssetMigrationPlan> {
  const inventory = await readBinaryAssetInventory(
    reader,
    kind.entityType,
    kind.placeholder,
  );
  const blocked: BlockedRow[] = [];
  const ready: Array<{ digest: string; sizeBytes: number; inline: number }> =
    [];
  for (const id of inventory.inlineIds) {
    // Each row decodes up to the write cap; collecting before the next keeps
    // peak memory flat however many rows the database holds.
    Bun.gc(true);
    const row = await readInlineBinaryRow(
      reader,
      kind.entityType,
      id,
      kind.placeholder,
    );
    if (!row) continue;
    const verdict = kind.classify(row.content);
    if (verdict.status === "ready") {
      ready.push({
        digest: verdict.digest,
        sizeBytes: verdict.sizeBytes,
        inline: row.content.length,
      });
    } else {
      blocked.push({ id, ...verdict });
    }
  }

  const distinct = new Map(ready.map((entry) => [entry.digest, entry]));
  const stored = [...distinct.keys()].filter((digest) =>
    inventory.storedDigests.has(digest),
  );
  const bytesToStore = [...distinct.values()]
    .filter((entry) => !inventory.storedDigests.has(entry.digest))
    .reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const inlineBytesFreed = ready.reduce((sum, entry) => sum + entry.inline, 0);
  const afterMigrationBytes = options.databaseBytes + bytesToStore;
  const vacuumBytes = Math.max(0, afterMigrationBytes - inlineBytesFreed);

  return {
    kind,
    inlineRows: inventory.inlineIds.length,
    ready: ready.length,
    blocked: blocked.sort((a, b) => a.id.localeCompare(b.id)),
    alreadyMigrated: inventory.referenceCount,
    awaitingRows: inventory.awaitingIds.length,
    placeholdersToClear: inventory.placeholderIds.length,
    uniqueDigests: distinct.size,
    duplicateRows: ready.length - distinct.size,
    alreadyStoredDigests: stored.length,
    bytesToStore,
    inlineBytesFreed,
    ftsRows: inventory.ftsRows,
    contentHashChanges: ready.length,
    disk: {
      databaseBytes: options.databaseBytes,
      backupBytes: options.databaseBytes,
      afterMigrationBytes,
      vacuumBytes,
      peakBytes: options.databaseBytes + afterMigrationBytes + vacuumBytes,
    },
  };
}
