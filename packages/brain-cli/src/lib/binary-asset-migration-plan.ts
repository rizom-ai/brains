import {
  readBinaryAssetInventory,
  readInlineBinaryRow,
  type OfflineReader,
} from "@brains/entity-service";
import { classifyInlineImage, type InlineImageBlocker } from "@brains/image";

/** One inline image that cannot become an asset as it is. */
export interface BlockedImage {
  id: string;
  reason: InlineImageBlocker;
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

/** What migrating every inline image to an asset would do. */
export interface ImageAssetMigrationPlan {
  inlineRows: number;
  ready: number;
  blocked: BlockedImage[];
  alreadyMigrated: number;
  /** Distinct images among the ready rows. */
  uniqueDigests: number;
  /** Ready rows whose bytes another ready row also carries. */
  duplicateRows: number;
  /** Distinct ready images already published as assets. */
  alreadyStoredDigests: number;
  /** New asset bytes: distinct ready images not yet stored. */
  bytesToStore: number;
  /** Inline content leaving the entities table. */
  inlineBytesFreed: number;
  ftsRows: number;
  contentHashChanges: number;
  disk: MigrationDiskEstimate;
}

/**
 * Plan the image migration without writing: every inline row is decoded and
 * classified one at a time, and only its digest and size are kept.
 */
export async function planImageAssetMigration(
  reader: OfflineReader,
  options: { databaseBytes: number },
): Promise<ImageAssetMigrationPlan> {
  const inventory = await readBinaryAssetInventory(reader, "image");
  const blocked: BlockedImage[] = [];
  const ready: Array<{ digest: string; sizeBytes: number; inline: number }> =
    [];
  for (const id of inventory.inlineIds) {
    const row = await readInlineBinaryRow(reader, "image", id);
    if (!row) continue;
    const verdict = classifyInlineImage(row.content);
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

  const distinct = new Map(ready.map((image) => [image.digest, image]));
  const stored = [...distinct.keys()].filter((digest) =>
    inventory.storedDigests.has(digest),
  );
  const bytesToStore = [...distinct.values()]
    .filter((image) => !inventory.storedDigests.has(image.digest))
    .reduce((sum, image) => sum + image.sizeBytes, 0);
  const inlineBytesFreed = ready.reduce((sum, image) => sum + image.inline, 0);
  const afterMigrationBytes = options.databaseBytes + bytesToStore;
  const vacuumBytes = Math.max(0, afterMigrationBytes - inlineBytesFreed);

  return {
    inlineRows: inventory.inlineIds.length,
    ready: ready.length,
    blocked: blocked.sort((a, b) => a.id.localeCompare(b.id)),
    alreadyMigrated: inventory.referenceCount,
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
