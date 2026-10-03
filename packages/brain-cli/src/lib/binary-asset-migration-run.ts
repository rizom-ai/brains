import {
  base64AssetSource,
  OfflineBinaryMigrator,
  readBinaryAssetInventory,
  readInlineBinaryRow,
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
 * already migrated are no longer inline, so a rerun skips them.
 */
export async function runImageAssetMigration(
  connection: OfflineEntityConnection,
): Promise<MigrationManifestEntry[]> {
  const migrator = new OfflineBinaryMigrator(connection);
  const inventory = await readBinaryAssetInventory(
    connection.client,
    "image",
    LEGACY_PENDING_IMAGE_PLACEHOLDER,
  );
  const entries: MigrationManifestEntry[] = [];
  for (const id of inventory.inlineIds) {
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
  await optimizeFullText(connection);
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

/** Fold the deleted full-text rows away, when the index exists. */
async function optimizeFullText(
  connection: OfflineEntityConnection,
): Promise<void> {
  const table = await connection.client.execute(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'entity_fts'",
  );
  if (Number(table.rows[0]?.["count"]) === 0) return;
  await connection.client.execute(
    "INSERT INTO entity_fts(entity_fts) VALUES('optimize')",
  );
}
