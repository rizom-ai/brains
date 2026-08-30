import {
  MAX_ASSET_BYTES,
  assertPreparedAsset,
  assetRefSchema,
  computeAssetDigest,
  getAssetDigest,
  parseAssetRef,
  type AssetReader,
  type AssetRecord,
  type AssetRef,
  type AssetStat,
  type AssetVerification,
  type PreparedAsset,
} from "@brains/assets";
import { eq } from "drizzle-orm";
import type { EntityDB } from "./db";
import { assets } from "./schema/assets";

export type AssetTransaction = Parameters<
  Parameters<EntityDB["transaction"]>[0]
>[0];

/** Validated and copied before a transaction acquires SQLite's write lock. */
export interface StagedAsset extends AssetRecord {
  bytes: Buffer;
}

export class AssetNotFoundError extends Error {
  public readonly ref: AssetRef;

  constructor(ref: AssetRef) {
    super(`Asset not found: ${ref}`);
    this.name = "AssetNotFoundError";
    this.ref = ref;
  }
}

export class AssetIntegrityError extends Error {
  public readonly ref: AssetRef;

  constructor(ref: AssetRef, detail: string) {
    super(`Asset integrity check failed for ${ref}: ${detail}`);
    this.name = "AssetIntegrityError";
    this.ref = ref;
  }
}

/**
 * SQLite implementation owned by the entity database. Durable insertion is
 * intentionally package-private and requires the entity transaction type.
 */
export class SqliteAssetRepository implements AssetReader {
  private readonly db: EntityDB;
  private readonly maxBytes: number;
  private readonly now: () => number;

  constructor(
    db: EntityDB,
    options: { maxBytes?: number; now?: () => number } = {},
  ) {
    this.db = db;
    this.maxBytes = options.maxBytes ?? MAX_ASSET_BYTES;
    this.now = options.now ?? Date.now;
  }

  /** Validate and copy bytes before entering an entity transaction. */
  public stage(prepared: PreparedAsset): StagedAsset {
    assertPreparedAsset(prepared);
    if (prepared.sizeBytes > this.maxBytes) {
      throw new Error(
        `Asset exceeds ${this.maxBytes}-byte repository limit: received ${prepared.sizeBytes} bytes`,
      );
    }
    return {
      ref: prepared.ref,
      digest: prepared.digest,
      sizeBytes: prepared.sizeBytes,
      bytes: Buffer.from(prepared.bytes),
    };
  }

  /**
   * Bind asset-backed entity content to bytes in the same transaction. Legacy
   * inline content is left alone for the temporary image migration window.
   */
  public async bindEntityContent(
    transaction: AssetTransaction,
    content: string,
    staged?: StagedAsset,
  ): Promise<void> {
    if (staged) {
      if (content !== staged.ref) {
        throw new Error(
          `Prepared asset ${staged.ref} does not match entity content`,
        );
      }
      await this.insertOrVerify(transaction, staged);
      return;
    }

    const parsed = assetRefSchema.safeParse(content);
    if (parsed.success) {
      await this.assertExists(transaction, parsed.data);
      return;
    }
    if (content.startsWith("asset://")) {
      parseAssetRef(content);
    }
  }

  public async read(ref: AssetRef): Promise<Uint8Array> {
    const canonical = parseAssetRef(ref);
    const rows = await this.db
      .select({ bytes: assets.bytes, sizeBytes: assets.sizeBytes })
      .from(assets)
      .where(eq(assets.digest, getAssetDigest(canonical)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AssetNotFoundError(canonical);
    this.assertSize(canonical, row.bytes, row.sizeBytes);
    return Uint8Array.from(row.bytes);
  }

  public async stat(ref: AssetRef): Promise<AssetStat | null> {
    const canonical = parseAssetRef(ref);
    const rows = await this.db
      .select({ sizeBytes: assets.sizeBytes })
      .from(assets)
      .where(eq(assets.digest, getAssetDigest(canonical)))
      .limit(1);
    const row = rows[0];
    return row ? { ref: canonical, sizeBytes: row.sizeBytes } : null;
  }

  public async verify(ref: AssetRef): Promise<AssetVerification> {
    const canonical = parseAssetRef(ref);
    const bytes = await this.read(canonical);
    const expectedDigest = getAssetDigest(canonical);
    const actualDigest = computeAssetDigest(bytes);
    return {
      ref: canonical,
      sizeBytes: bytes.byteLength,
      expectedDigest,
      actualDigest,
      valid: actualDigest === expectedDigest,
    };
  }

  private async insertOrVerify(
    transaction: AssetTransaction,
    staged: StagedAsset,
  ): Promise<void> {
    const inserted = await transaction
      .insert(assets)
      .values({
        digest: staged.digest,
        bytes: staged.bytes,
        sizeBytes: staged.sizeBytes,
        created: this.now(),
      })
      .onConflictDoNothing({ target: assets.digest })
      .returning({ digest: assets.digest });
    if (inserted.length > 0) return;

    // A duplicate is safe only when the existing immutable row really has the
    // digest and size its key claims.
    const rows = await transaction
      .select({ bytes: assets.bytes, sizeBytes: assets.sizeBytes })
      .from(assets)
      .where(eq(assets.digest, staged.digest))
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      throw new AssetIntegrityError(
        staged.ref,
        "conflicting row disappeared during insertion",
      );
    }
    this.assertSize(staged.ref, existing.bytes, existing.sizeBytes);
    if (existing.sizeBytes !== staged.sizeBytes) {
      throw new AssetIntegrityError(
        staged.ref,
        `stored size ${existing.sizeBytes} does not match prepared size ${staged.sizeBytes}`,
      );
    }
    const actualDigest = computeAssetDigest(existing.bytes);
    if (actualDigest !== staged.digest) {
      throw new AssetIntegrityError(
        staged.ref,
        `stored digest is ${actualDigest}`,
      );
    }
  }

  private async assertExists(
    transaction: AssetTransaction,
    ref: AssetRef,
  ): Promise<void> {
    const rows = await transaction
      .select({ digest: assets.digest })
      .from(assets)
      .where(eq(assets.digest, getAssetDigest(ref)))
      .limit(1);
    if (rows.length === 0) throw new AssetNotFoundError(ref);
  }

  private assertSize(ref: AssetRef, bytes: Buffer, sizeBytes: number): void {
    if (bytes.byteLength !== sizeBytes) {
      throw new AssetIntegrityError(
        ref,
        `stored byte count ${bytes.byteLength} does not match declared size ${sizeBytes}`,
      );
    }
    if (sizeBytes < 0 || sizeBytes > this.maxBytes) {
      throw new AssetIntegrityError(
        ref,
        `stored size ${sizeBytes} is outside the accepted 0-${this.maxBytes} range`,
      );
    }
  }
}
