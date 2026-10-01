import {
  ASSET_REF_PREFIX,
  type AssetRef,
  type AssetSource,
} from "@brains/assets";
import { computeContentHash } from "@brains/utils/hash";
import { and, eq, sql } from "drizzle-orm";
import type { EntityDB } from "../db";
import { entities } from "../schema/entities";
import { SqliteAssetRepository } from "../sqlite-asset-repository";

/** One inline row to move into an asset, as its plan read it. */
export interface InlineRowMigrationInput {
  id: string;
  /** The row's content hash when it was read; a changed row is left alone. */
  expectedContentHash: string;
  bytes: AssetSource;
  expectedSize: number;
  /** Binary facts read from the bytes, merged over the stored metadata. */
  metadata: Record<string, unknown>;
}

export type InlineRowMigrationOutcome =
  | { outcome: "migrated"; ref: AssetRef; contentHash: string }
  | { outcome: "changed" };

/**
 * Moves inline rows of an asset-backed type into published assets while the
 * app is stopped. Bytes are staged in committed chunks, then one entity
 * transaction publishes them, rewrites the row and drops its full-text row.
 * Identity, visibility and timestamps stay as they were.
 */
export class OfflineBinaryMigrator {
  private readonly db: EntityDB;
  private readonly repository: SqliteAssetRepository;
  private ftsTable: Promise<boolean> | undefined;

  constructor(connection: { db: EntityDB }) {
    this.db = connection.db;
    this.repository = new SqliteAssetRepository(connection.db);
  }

  public async migrateRow(
    entityType: string,
    input: InlineRowMigrationInput,
  ): Promise<InlineRowMigrationOutcome> {
    const hasFts = await this.hasFtsTable();
    const staged = await this.repository.stage(input.bytes, {
      expectedSize: input.expectedSize,
    });
    const upload = this.repository.claim(staged);
    try {
      return await this.db.transaction(async (transaction) => {
        const [current] = await transaction
          .select({
            content: entities.content,
            contentHash: entities.contentHash,
            metadata: entities.metadata,
          })
          .from(entities)
          .where(
            and(eq(entities.entityType, entityType), eq(entities.id, input.id)),
          );
        if (
          current?.contentHash !== input.expectedContentHash ||
          current.content.startsWith(ASSET_REF_PREFIX)
        ) {
          return { outcome: "changed" } as const;
        }
        await this.repository.bindEntityContent(
          transaction,
          staged.ref,
          upload,
        );
        // An asset-backed row serializes to its reference.
        const contentHash = computeContentHash(staged.ref);
        await transaction
          .update(entities)
          .set({
            content: staged.ref,
            contentHash,
            metadata: { ...current.metadata, ...input.metadata },
          })
          .where(
            and(eq(entities.entityType, entityType), eq(entities.id, input.id)),
          );
        if (hasFts) {
          await transaction.run(
            sql`DELETE FROM entity_fts WHERE entity_id = ${input.id} AND entity_type = ${entityType}`,
          );
        }
        return { outcome: "migrated", ref: staged.ref, contentHash } as const;
      });
    } finally {
      // Discards the upload unless this row's transaction published it.
      await this.repository.release(staged);
    }
  }

  /** A database that never started has no full-text index to clean. */
  private hasFtsTable(): Promise<boolean> {
    this.ftsTable ??= this.db
      .all<{
        count: number;
      }>(
        sql`SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'entity_fts'`,
      )
      .then((rows) => Number(rows[0]?.count) > 0);
    return this.ftsTable;
  }
}
