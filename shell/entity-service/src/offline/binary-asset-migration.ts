import {
  ASSET_REF_PREFIX,
  type AssetRef,
  type AssetSource,
  type StagedAsset,
} from "@brains/assets";
import { computeContentHash } from "@brains/utils/hash";
import { and, eq, sql } from "drizzle-orm";
import type { EntityDB } from "../db";
import { entities } from "../schema/entities";
import {
  SqliteAssetRepository,
  type AssetTransaction,
  type StagedUpload,
} from "../sqlite-asset-repository";

/** Bytes to store, with the size they must have. */
interface AssetBytes {
  bytes: AssetSource;
  expectedSize: number;
}

/** One inline row to move into an asset, as its plan read it. */
export interface InlineRowMigrationInput extends AssetBytes {
  id: string;
  /** The row's content hash when it was read; a changed row is left alone. */
  expectedContentHash: string;
  /** Binary facts read from the bytes, merged over the stored metadata. */
  metadata: Record<string, unknown>;
}

/** The bytes behind a row that already references them. */
export interface AssetRestoreInput extends AssetBytes {
  id: string;
  ref: AssetRef;
}

/** A row to create from a file, with the facts its bytes give. */
export interface AssetRowInput extends AssetBytes {
  id: string;
  metadata: Record<string, unknown>;
  created: number;
  updated: number;
}

export type InlineRowMigrationOutcome =
  | { outcome: "migrated"; ref: AssetRef; contentHash: string }
  | { outcome: "changed" };

export type AssetRestoreOutcome =
  { outcome: "restored" } | { outcome: "changed" };

export type AssetRowOutcome =
  | { outcome: "created"; ref: AssetRef; contentHash: string }
  | { outcome: "changed" };

/**
 * Moves rows of an asset-backed type into published assets while the app is
 * stopped. Bytes are staged in committed chunks, then one entity transaction
 * checks the row is as expected, publishes the bytes and writes the row.
 * Anything unexpected writes nothing, and an unpublished upload is discarded.
 */
export class OfflineBinaryMigrator {
  private readonly db: EntityDB;
  private readonly repository: SqliteAssetRepository;
  private ftsTable: Promise<boolean> | undefined;

  constructor(connection: { db: EntityDB }) {
    this.db = connection.db;
    this.repository = new SqliteAssetRepository(connection.db);
  }

  /** Replace an inline row's content with a published reference. */
  public async migrateRow(
    entityType: string,
    input: InlineRowMigrationInput,
  ): Promise<InlineRowMigrationOutcome> {
    const hasFts = await this.hasFtsTable();
    return this.publishing(input, async (transaction, staged, upload) => {
      const [current] = await transaction
        .select({
          content: entities.content,
          contentHash: entities.contentHash,
          metadata: entities.metadata,
        })
        .from(entities)
        .where(this.row(entityType, input.id));
      if (
        current?.contentHash !== input.expectedContentHash ||
        current.content.startsWith(ASSET_REF_PREFIX)
      ) {
        return { outcome: "changed" } as const;
      }
      await this.repository.bindEntityContent(transaction, staged.ref, upload);
      // An asset-backed row serializes to its reference.
      const contentHash = computeContentHash(staged.ref);
      await transaction
        .update(entities)
        .set({
          content: staged.ref,
          contentHash,
          metadata: { ...current.metadata, ...input.metadata },
        })
        .where(this.row(entityType, input.id));
      if (hasFts) {
        await transaction.run(
          sql`DELETE FROM entity_fts WHERE entity_id = ${input.id} AND entity_type = ${entityType}`,
        );
      }
      return { outcome: "migrated", ref: staged.ref, contentHash } as const;
    });
  }

  /**
   * Publish the bytes behind a row whose reference lost its asset. A row
   * that references anything else is left as it is.
   */
  public async restoreAsset(
    entityType: string,
    input: AssetRestoreInput,
  ): Promise<AssetRestoreOutcome> {
    return this.publishing(input, async (transaction, staged, upload) => {
      const [current] = await transaction
        .select({ content: entities.content })
        .from(entities)
        .where(this.row(entityType, input.id));
      if (current?.content !== input.ref || staged.ref !== input.ref) {
        return { outcome: "changed" } as const;
      }
      await this.repository.bindEntityContent(transaction, staged.ref, upload);
      return { outcome: "restored" } as const;
    });
  }

  /** Create a missing row together with its asset; an existing row wins. */
  public async createRow(
    entityType: string,
    input: AssetRowInput,
  ): Promise<AssetRowOutcome> {
    return this.publishing(input, async (transaction, staged, upload) => {
      const [current] = await transaction
        .select({ id: entities.id })
        .from(entities)
        .where(this.row(entityType, input.id));
      if (current) return { outcome: "changed" } as const;
      await this.repository.bindEntityContent(transaction, staged.ref, upload);
      const contentHash = computeContentHash(staged.ref);
      await transaction.insert(entities).values({
        id: input.id,
        entityType,
        content: staged.ref,
        contentHash,
        metadata: input.metadata,
        created: input.created,
        updated: input.updated,
      });
      return { outcome: "created", ref: staged.ref, contentHash } as const;
    });
  }

  /**
   * Stage bytes, then run one entity transaction that may publish them.
   * The upload is discarded unless that transaction published it.
   */
  private async publishing<TResult>(
    input: AssetBytes,
    write: (
      transaction: AssetTransaction,
      staged: StagedAsset,
      upload: StagedUpload,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    const staged = await this.repository.stage(input.bytes, {
      expectedSize: input.expectedSize,
    });
    const upload = this.repository.claim(staged);
    try {
      return await this.db.transaction((transaction) =>
        write(transaction, staged, upload),
      );
    } finally {
      await this.repository.release(staged);
    }
  }

  private row(entityType: string, id: string): ReturnType<typeof and> {
    return and(eq(entities.entityType, entityType), eq(entities.id, id));
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
