import { createHash, randomUUID, type Hash } from "node:crypto";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import {
  ASSET_CHUNK_BYTES,
  MAX_ASSET_BYTES,
  assetRefSchema,
  chunkAssetSource,
  createAssetRef,
  getAssetDigest,
  parseAssetRef,
  resolveAssetStageLimits,
  type AssetReader,
  type AssetRef,
  type AssetSource,
  type AssetStageLimits,
  type AssetStat,
  type AssetVerification,
  type StageAssetOptions,
  type StagedAsset,
} from "@brains/assets";
import { and, eq, lt, notExists, sql } from "drizzle-orm";
import type { EntityDB } from "./db";
import { assetChunks, assetUploads, assets } from "./schema/assets";

export type AssetTransaction = Parameters<
  Parameters<EntityDB["transaction"]>[0]
>[0];

/** Runs one autocommit write, serialized with the entity transactions. */
export type AssetWriteRunner = <TResult>(
  write: () => Promise<TResult>,
) => Promise<TResult>;

/** Repository-private facts behind a staged handle. */
export interface StagedUpload {
  readonly asset: StagedAsset;
  readonly uploadId: string;
  readonly chunkCount: number;
}

interface AssetHeader {
  uploadId: string;
  sizeBytes: number;
  chunkCount: number;
}

/** Unpublished uploads older than this are presumed abandoned. */
const ORPHAN_AGE_MS = 60 * 60 * 1000;
/** Chunks deleted per autocommit, so discarding never becomes one large write. */
const DISCARD_BATCH_CHUNKS = 8;

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
 * SQLite implementation owned by the entity database. Bytes are staged as
 * individually committed chunks under a private upload key; only an entity
 * transaction publishes them, by inserting the asset header beside the
 * entity reference. Every chunk write yields to the event loop.
 */
export class SqliteAssetRepository implements AssetReader {
  private readonly db: EntityDB;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private readonly runWrite: AssetWriteRunner;
  private readonly orphanAgeMs: number;
  private readonly uploads = new WeakMap<
    StagedAsset,
    { upload: StagedUpload; claimed: boolean }
  >();

  constructor(
    db: EntityDB,
    options: {
      maxBytes?: number;
      now?: () => number;
      runWrite?: AssetWriteRunner;
      orphanAgeMs?: number;
    } = {},
  ) {
    this.db = db;
    this.maxBytes = options.maxBytes ?? MAX_ASSET_BYTES;
    this.now = options.now ?? Date.now;
    // The shared client retries a refused write; a second budget here would stack.
    this.runWrite =
      options.runWrite ??
      (<TResult>(write: () => Promise<TResult>): Promise<TResult> => write());
    this.orphanAgeMs = options.orphanAgeMs ?? ORPHAN_AGE_MS;
  }

  /** Durably stage bytes without publishing them. */
  public async stage(
    source: AssetSource,
    options: StageAssetOptions = {},
  ): Promise<StagedAsset> {
    const limits = resolveAssetStageLimits(options, this.maxBytes);
    await this.sweepOrphanUploads();
    const uploadId = randomUUID();
    await this.runWrite(() =>
      this.db.insert(assetUploads).values({ uploadId, created: this.now() }),
    );
    try {
      return await this.writeChunks(uploadId, source, limits);
    } catch (error) {
      // Cleanup is best effort; the sweeper reclaims anything left behind.
      await this.discardUpload(uploadId).catch(() => undefined);
      throw error;
    }
  }

  /** Reserve a staged handle for one mutation. */
  public claim(asset: StagedAsset): StagedUpload {
    const entry = this.uploads.get(asset);
    if (!entry) throw new Error(`Unknown staged asset ${asset.ref}`);
    if (entry.claimed) {
      throw new Error(`Staged asset was already used: ${asset.ref}`);
    }
    entry.claimed = true;
    return entry.upload;
  }

  /** The upload behind a handle its mutation has already claimed. */
  public claimedUpload(asset: StagedAsset): StagedUpload {
    const entry = this.uploads.get(asset);
    if (!entry) throw new Error(`Unknown staged asset ${asset.ref}`);
    if (!entry.claimed) {
      throw new Error(`Staged asset ${asset.ref} was not claimed`);
    }
    return entry.upload;
  }

  /** Discard a handle's upload unless an asset header publishes it. */
  public async release(asset: StagedAsset): Promise<void> {
    const entry = this.uploads.get(asset);
    if (entry) await this.discardUpload(entry.upload.uploadId);
  }

  /**
   * Bind asset-backed entity content inside its entity transaction. A staged
   * upload is published here; a bare reference must already be published.
   * Legacy inline content is left alone for the image migration window.
   */
  public async bindEntityContent(
    transaction: AssetTransaction,
    content: string,
    upload?: StagedUpload,
  ): Promise<void> {
    if (upload) {
      if (content !== upload.asset.ref) {
        throw new Error(
          `Staged asset ${upload.asset.ref} does not match entity content`,
        );
      }
      await this.publish(transaction, upload);
      return;
    }

    const parsed = assetRefSchema.safeParse(content);
    if (parsed.success) {
      if (!(await this.header(transaction, parsed.data))) {
        throw new AssetNotFoundError(parsed.data);
      }
      return;
    }
    if (content.startsWith("asset://")) {
      parseAssetRef(content);
    }
  }

  public async openRead(ref: AssetRef): Promise<AsyncIterable<Uint8Array>> {
    const canonical = parseAssetRef(ref);
    const header = await this.header(this.db, canonical);
    if (!header) throw new AssetNotFoundError(canonical);
    return this.readChunks(canonical, header, 0, createHash("sha256"));
  }

  public async read(ref: AssetRef): Promise<Uint8Array> {
    const canonical = parseAssetRef(ref);
    const header = await this.header(this.db, canonical);
    if (!header) throw new AssetNotFoundError(canonical);
    const output = Buffer.allocUnsafe(header.sizeBytes);
    let offset = 0;
    for await (const chunk of this.readChunks(
      canonical,
      header,
      0,
      createHash("sha256"),
    )) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  public async stat(ref: AssetRef): Promise<AssetStat | null> {
    const canonical = parseAssetRef(ref);
    const header = await this.header(this.db, canonical);
    return header ? { ref: canonical, sizeBytes: header.sizeBytes } : null;
  }

  public async verify(ref: AssetRef): Promise<AssetVerification> {
    const canonical = parseAssetRef(ref);
    const header = await this.header(this.db, canonical);
    if (!header) throw new AssetNotFoundError(canonical);
    const hash = createHash("sha256");
    let sizeBytes = 0;
    // Verification reports a mismatch instead of refusing the bytes.
    for await (const chunk of this.readChunks(canonical, header, 0, null)) {
      hash.update(chunk);
      sizeBytes += chunk.byteLength;
    }
    const expectedDigest = getAssetDigest(canonical);
    const actualDigest = hash.digest("hex");
    return {
      ref: canonical,
      sizeBytes,
      expectedDigest,
      actualDigest,
      valid: actualDigest === expectedDigest,
    };
  }

  /** Delete unpublished uploads older than the orphan age. */
  public async sweepOrphanUploads(): Promise<number> {
    const cutoff = this.now() - this.orphanAgeMs;
    const orphans = await this.db
      .select({ uploadId: assetUploads.uploadId })
      .from(assetUploads)
      .where(
        and(
          lt(assetUploads.created, cutoff),
          notExists(
            this.db
              .select({ uploadId: assets.uploadId })
              .from(assets)
              .where(eq(assets.uploadId, assetUploads.uploadId)),
          ),
        ),
      );
    await orphans.reduce<Promise<void>>(async (previous, orphan) => {
      await previous;
      await this.discardUpload(orphan.uploadId);
    }, Promise.resolve());
    return orphans.length;
  }

  private async writeChunks(
    uploadId: string,
    source: AssetSource,
    limits: AssetStageLimits,
  ): Promise<StagedAsset> {
    const hash = createHash("sha256");
    let sizeBytes = 0;
    let chunkCount = 0;
    for await (const chunk of chunkAssetSource(source)) {
      sizeBytes += chunk.byteLength;
      if (sizeBytes > limits.maxBytes) {
        throw new Error(
          `Asset exceeds ${limits.maxBytes}-byte limit: received more than ${limits.maxBytes} bytes`,
        );
      }
      // Own the slice so the hashed bytes are exactly the stored bytes.
      const bytes = Buffer.from(chunk);
      const ordinal = chunkCount;
      hash.update(bytes);
      await this.runWrite(() =>
        this.db.insert(assetChunks).values({ uploadId, ordinal, bytes }),
      );
      chunkCount++;
      await yieldToEventLoop();
    }
    if (
      limits.expectedSize !== undefined &&
      sizeBytes !== limits.expectedSize
    ) {
      throw new Error(
        `Asset size mismatch: expected ${limits.expectedSize} bytes, received ${sizeBytes}`,
      );
    }
    const digest = hash.digest("hex");
    const asset: StagedAsset = Object.freeze({
      ref: createAssetRef(digest),
      digest,
      sizeBytes,
    });
    this.uploads.set(asset, {
      upload: { asset, uploadId, chunkCount },
      claimed: false,
    });
    return asset;
  }

  /** Insert the header that makes a complete upload visible, or reuse the digest. */
  private async publish(
    transaction: AssetTransaction,
    upload: StagedUpload,
  ): Promise<void> {
    const { asset, uploadId, chunkCount } = upload;
    const existing = await this.header(transaction, asset.ref);
    if (existing) {
      if (existing.sizeBytes !== asset.sizeBytes) {
        throw new AssetIntegrityError(
          asset.ref,
          `stored size ${existing.sizeBytes} does not match staged size ${asset.sizeBytes}`,
        );
      }
      return;
    }

    const uploads = await transaction
      .select({ uploadId: assetUploads.uploadId })
      .from(assetUploads)
      .where(eq(assetUploads.uploadId, uploadId))
      .limit(1);
    if (uploads.length === 0) {
      throw new AssetIntegrityError(
        asset.ref,
        "staged upload no longer exists",
      );
    }
    const [staged] = await transaction
      .select({
        chunks: sql<number>`count(*)`,
        bytes: sql<number>`coalesce(sum(length(${assetChunks.bytes})), 0)`,
      })
      .from(assetChunks)
      .where(eq(assetChunks.uploadId, uploadId));
    const stagedChunks = Number(staged?.chunks ?? 0);
    const stagedBytes = Number(staged?.bytes ?? 0);
    if (stagedChunks !== chunkCount || stagedBytes !== asset.sizeBytes) {
      throw new AssetIntegrityError(
        asset.ref,
        `staged upload holds ${stagedChunks} chunks and ${stagedBytes} bytes; expected ${chunkCount} and ${asset.sizeBytes}`,
      );
    }
    await transaction.insert(assets).values({
      digest: asset.digest,
      uploadId,
      sizeBytes: asset.sizeBytes,
      chunkCount,
      created: this.now(),
    });
  }

  private async header(
    database: Pick<EntityDB, "select">,
    ref: AssetRef,
  ): Promise<AssetHeader | null> {
    const rows = await database
      .select({
        uploadId: assets.uploadId,
        sizeBytes: assets.sizeBytes,
        chunkCount: assets.chunkCount,
      })
      .from(assets)
      .where(eq(assets.digest, getAssetDigest(ref)))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Stream an asset's chunks in order. With a hash, the digest is checked
   * before the final chunk is yielded, so no reader receives the whole of
   * bytes that do not match their reference.
   */
  private async *readChunks(
    ref: AssetRef,
    header: AssetHeader,
    ordinal: number,
    hash: Hash | null,
  ): AsyncGenerator<Uint8Array, void, undefined> {
    if (ordinal === header.chunkCount) {
      await this.assertComplete(ref, header, hash);
      return;
    }
    const rows = await this.db
      .select({ bytes: assetChunks.bytes })
      .from(assetChunks)
      .where(
        and(
          eq(assetChunks.uploadId, header.uploadId),
          eq(assetChunks.ordinal, ordinal),
        ),
      )
      .limit(1);
    const bytes = rows[0]?.bytes;
    if (!bytes) {
      throw new AssetIntegrityError(ref, `chunk ${ordinal} is missing`);
    }
    const expected = Math.min(
      ASSET_CHUNK_BYTES,
      header.sizeBytes - ordinal * ASSET_CHUNK_BYTES,
    );
    if (bytes.byteLength !== expected) {
      throw new AssetIntegrityError(
        ref,
        `chunk ${ordinal} holds ${bytes.byteLength} bytes; expected ${expected}`,
      );
    }
    hash?.update(bytes);
    if (hash && ordinal === header.chunkCount - 1) {
      await this.assertComplete(ref, header, hash);
      yield bytes;
      return;
    }
    yield bytes;
    await yieldToEventLoop();
    yield* this.readChunks(ref, header, ordinal + 1, hash);
  }

  /** No chunks beyond the declared count, and, when hashed, the digest holds. */
  private async assertComplete(
    ref: AssetRef,
    header: AssetHeader,
    hash: Hash | null,
  ): Promise<void> {
    await this.assertNoExtraChunks(ref, header);
    if (!hash) return;
    const actual = hash.digest("hex");
    if (actual !== getAssetDigest(ref)) {
      throw new AssetIntegrityError(ref, `stored bytes hash to ${actual}`);
    }
  }

  private async assertNoExtraChunks(
    ref: AssetRef,
    header: AssetHeader,
  ): Promise<void> {
    const [extra] = await this.db
      .select({ chunks: sql<number>`count(*)` })
      .from(assetChunks)
      .where(
        and(
          eq(assetChunks.uploadId, header.uploadId),
          sql`${assetChunks.ordinal} >= ${header.chunkCount}`,
        ),
      );
    if (Number(extra?.chunks ?? 0) > 0) {
      throw new AssetIntegrityError(
        ref,
        `upload holds chunks beyond its ${header.chunkCount} declared`,
      );
    }
  }

  /**
   * Delete an upload in bounded batches. Every statement re-checks that no
   * header publishes the upload, so a concurrent publish is never undone.
   */
  private async discardUpload(uploadId: string): Promise<void> {
    const unpublished = sql`NOT EXISTS (SELECT 1 FROM assets WHERE upload_id = ${uploadId})`;
    const deleted = await this.runWrite(() =>
      this.db.run(
        sql`DELETE FROM asset_chunks WHERE upload_id = ${uploadId} AND ordinal IN (SELECT ordinal FROM asset_chunks WHERE upload_id = ${uploadId} ORDER BY ordinal LIMIT ${DISCARD_BATCH_CHUNKS}) AND ${unpublished}`,
      ),
    );
    if (Number(deleted.rowsAffected) === DISCARD_BATCH_CHUNKS) {
      await yieldToEventLoop();
      return this.discardUpload(uploadId);
    }
    await this.runWrite(() =>
      this.db.run(
        sql`DELETE FROM asset_uploads WHERE upload_id = ${uploadId} AND ${unpublished} AND NOT EXISTS (SELECT 1 FROM asset_chunks WHERE upload_id = ${uploadId})`,
      ),
    );
  }
}
