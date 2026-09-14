import {
  MAX_ASSET_BYTES,
  assetRecordSchema,
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
import { eq, sql, getTableName } from "drizzle-orm";
import {
  binaryReadSelectionSchema,
  type BinaryReadSelection,
} from "@brains/db/binary-read";
import { AsyncLocalStorage } from "node:async_hooks";
import { assetChunkRangeSchema } from "./asset-transfers";
import type { EntityDB } from "./db";
import { assets } from "./schema/assets";

export type AssetTransaction = Parameters<
  Parameters<EntityDB["transaction"]>[0]
>[0];

/** Validated and copied before a transaction acquires SQLite's write lock. */
export interface StagedAsset extends AssetRecord {
  bytes: Buffer;
}

/** Owner-internal capability, never a serializable entity/RPC input.
 * The issuer retains cleanup responsibility on every outcome, including rejected
 * handoffs. run establishes claim scope after initialization and awaits its
 * lifecycle; bind must insert or verify immutable bytes on exactly the supplied
 * entity transaction.
 */
export interface OwnedAssetPublication {
  readonly record: AssetRecord;
  run<T>(operation: () => Promise<T>): Promise<T>;
  bind(transaction: AssetTransaction, createdAt: number): Promise<void>;
}

export interface PublicationStage extends AssetRecord {
  bind(transaction: AssetTransaction, createdAt: number): Promise<void>;
}
export type EntityAssetStage = StagedAsset | PublicationStage;
interface PublicationScope {
  readonly record: AssetRecord;
  readonly bind: OwnedAssetPublication["bind"];
  active: boolean;
  claimed: boolean;
  bindingStarted: boolean;
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
  private readonly publications = new AsyncLocalStorage<PublicationScope>();
  private readonly consumedPublications = new WeakSet<OwnedAssetPublication>();

  constructor(
    db: EntityDB,
    options: { maxBytes?: number; now?: () => number } = {},
  ) {
    this.db = db;
    this.maxBytes = options.maxBytes ?? MAX_ASSET_BYTES;
    this.now = options.now ?? Date.now;
  }

  /** Enter one owner-issued publication. This scope does not itself release bytes. */
  public async withPublication<T>(
    publication: OwnedAssetPublication,
    operation: () => Promise<T>,
    initialize: () => Promise<void>,
  ): Promise<T> {
    const current = this.publications.getStore();
    if (current?.active && !current.claimed)
      return Promise.reject(
        new Error("Nested unclaimed asset publication is not allowed"),
      );
    if (this.consumedPublications.has(publication))
      return Promise.reject(
        new Error("Asset publication was already consumed"),
      );
    this.consumedPublications.add(publication); // Consume before any await, including initialization.
    const bind = publication.bind.bind(publication);
    const run = publication.run.bind(publication);
    const parsed = assetRecordSchema.safeParse(publication.record);
    let admissionFailure: { error: unknown } | undefined;
    if (!parsed.success) admissionFailure = { error: parsed.error };
    else if (
      parsed.data.sizeBytes > MAX_ASSET_BYTES ||
      parsed.data.sizeBytes > this.maxBytes
    )
      admissionFailure = {
        error: new Error("Asset publication exceeds repository capacity"),
      };
    else {
      try {
        await initialize();
      } catch (error) {
        admissionFailure = { error };
      }
    }
    // Initial migrations must not accidentally acquire this publication's claims.
    // Still enter the owner's retirement wrapper if admission failed.
    let entered = false;
    try {
      return await run(async () => {
        if (entered)
          throw new Error("Asset publication operation was already entered");
        entered = true;
        if (admissionFailure) throw admissionFailure.error;
        if (!parsed.success) throw parsed.error;
        const record = Object.freeze(parsed.data);
        const scope: PublicationScope = {
          record,
          bind,
          active: true,
          claimed: false,
          bindingStarted: false,
        };
        try {
          return await this.publications.run(scope, operation);
        } finally {
          scope.active = false;
        }
      });
    } catch (error) {
      if (admissionFailure && admissionFailure.error !== error)
        throw new AggregateError(
          [admissionFailure.error, error],
          "Asset publication admission and owner lifetime failed",
          { cause: error },
        );
      throw error;
    }
  }

  /** Claim the current publication before mutation admission/transaction acquisition. */
  public claimPublication(): PublicationStage | undefined {
    const scope = this.publications.getStore();
    // Subsequent event-driven mutations must not inherit this operation's input.
    if (!scope || !scope.active || scope.claimed) return undefined;
    scope.claimed = true;
    return {
      ...scope.record,
      bind: async (transaction, createdAt): Promise<void> => {
        if (!scope.active || scope.bindingStarted)
          throw new Error(
            "Asset publication binding is closed or already consumed",
          );
        scope.bindingStarted = true;
        await scope.bind(transaction, createdAt);
      },
    };
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
    staged?: EntityAssetStage,
  ): Promise<void> {
    if (staged) {
      if (content !== staged.ref) {
        throw new Error(
          `Prepared asset ${staged.ref} does not match entity content`,
        );
      }
      if ("bind" in staged) {
        await staged.bind(transaction, this.now());
        const [row] = await transaction
          .select({
            size: assets.sizeBytes,
            actualSize: sql<number>`length(${assets.bytes})`,
            storageType: sql<string>`typeof(${assets.bytes})`,
          })
          .from(assets)
          .where(eq(assets.digest, staged.digest))
          .limit(1);
        if (!row) throw new AssetNotFoundError(staged.ref);
        if (
          row.storageType !== "blob" ||
          row.size !== staged.sizeBytes ||
          row.actualSize !== staged.sizeBytes
        ) {
          throw new AssetIntegrityError(
            staged.ref,
            "publication storage type or size does not match its receipt",
          );
        }
      } else await this.insertOrVerify(transaction, staged);
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

  /** SQLite slices the BLOB; only one bounded chunk crosses the native bridge. */
  public async readChunk(
    ref: AssetRef,
    offset: number,
    length: number,
  ): Promise<Uint8Array> {
    const canonical = parseAssetRef(ref);
    assetChunkRangeSchema.parse({ offset, length });
    const [row] = await this.db
      .select({
        bytes: sql`substr(${assets.bytes}, ${offset + 1}, ${length})`.mapWith(
          assets.bytes,
        ),
        sizeBytes: assets.sizeBytes,
        actualSize: sql<number>`length(${assets.bytes})`,
      })
      .from(assets)
      .where(eq(assets.digest, getAssetDigest(canonical)))
      .limit(1);
    if (!row) throw new AssetNotFoundError(canonical);
    if (
      row.actualSize !== row.sizeBytes ||
      row.sizeBytes < 0 ||
      row.sizeBytes > this.maxBytes ||
      offset > row.sizeBytes ||
      row.bytes.byteLength !== Math.min(length, row.sizeBytes - offset)
    ) {
      throw new AssetIntegrityError(
        canonical,
        "invalid byte range or stored size",
      );
    }
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

  /** Metadata only. The execution owner verifies size/type/digest before offering bytes. */
  public async selectRead(ref: AssetRef): Promise<BinaryReadSelection> {
    const canonical = parseAssetRef(ref);
    const stat = await this.stat(canonical);
    if (!stat) throw new AssetNotFoundError(canonical);
    return binaryReadSelectionSchema.parse({
      sha256: getAssetDigest(canonical),
      plan: {
        table: getTableName(assets),
        column: assets.bytes.name,
        key: [{ column: assets.digest.name, value: getAssetDigest(canonical) }],
        maxBytes: stat.sizeBytes,
        expectedSize: stat.sizeBytes,
      },
    });
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
