import { createHash } from "node:crypto";
import {
  createAssetRef,
  getAssetDigest,
  type AssetRecord,
  type AssetRef,
  type AssetStat,
  type AssetStore,
  type AssetVerification,
} from "@brains/assets";
import type {
  BinaryAssetMigrationRepository,
  BinaryEntityIdentifier,
  BinaryEntityRow,
  BinaryEntityUpdate,
} from "../../src/lib/binary-asset-migration";

export class ObservedAssetStore implements AssetStore {
  readonly events: string[];
  readonly records: Map<AssetRef, Uint8Array> = new Map();

  constructor(events: string[]) {
    this.events = events;
  }

  async put(bytes: Uint8Array): Promise<AssetRecord> {
    const digest = createHash("sha256").update(bytes).digest("hex");
    const ref = createAssetRef(digest);
    this.records.set(ref, bytes);
    this.events.push(`put:${ref}`);
    return { ref, digest, sizeBytes: bytes.byteLength };
  }

  async putStream(chunks: AsyncIterable<Uint8Array>): Promise<AssetRecord> {
    this.events.push("put-stream");
    const bytes: number[] = [];
    for await (const chunk of chunks) bytes.push(...chunk);
    return this.put(Uint8Array.from(bytes));
  }

  async read(ref: AssetRef): Promise<Uint8Array> {
    const bytes = this.records.get(ref);
    if (!bytes) throw new Error(`Missing asset: ${ref}`);
    return bytes;
  }

  async stat(ref: AssetRef): Promise<AssetStat | null> {
    const bytes = this.records.get(ref);
    return bytes ? { ref, sizeBytes: bytes.byteLength } : null;
  }

  async verify(ref: AssetRef): Promise<AssetVerification> {
    this.events.push(`verify:${ref}`);
    const bytes = this.records.get(ref);
    if (!bytes) throw new Error(`Missing asset: ${ref}`);
    const actualDigest = createHash("sha256").update(bytes).digest("hex");
    return {
      ref,
      sizeBytes: bytes.byteLength,
      expectedDigest: getAssetDigest(ref),
      actualDigest,
      valid: actualDigest === getAssetDigest(ref),
    };
  }
}

export class ObservedRepository implements BinaryAssetMigrationRepository {
  readonly events: string[] = [];
  readonly rows: BinaryEntityRow[];
  updates: BinaryEntityUpdate[] = [];
  ftsDeletes: BinaryEntityIdentifier[] = [];
  ftsEntities: BinaryEntityIdentifier[] = [];

  constructor(rows: BinaryEntityRow[]) {
    this.rows = rows;
  }

  async probeExclusiveLock(): Promise<void> {
    this.events.push("probe-lock");
  }

  async listRows(entityType: string): Promise<BinaryEntityRow[]> {
    this.events.push(`list:${entityType}`);
    return this.rows;
  }

  async applyUpdates(
    updates: BinaryEntityUpdate[],
    ftsEntities: BinaryEntityIdentifier[],
  ): Promise<void> {
    this.events.push("transaction");
    this.updates = updates;
    this.ftsDeletes = ftsEntities;
  }

  async listFtsEntities(entityType: string): Promise<BinaryEntityIdentifier[]> {
    this.events.push(`fts:${entityType}`);
    return this.ftsEntities;
  }
}
