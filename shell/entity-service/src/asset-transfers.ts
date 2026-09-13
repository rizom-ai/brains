import {
  MAX_ASSET_BYTES,
  assetRecordSchema,
  computeAssetDigest,
  type AssetRecord,
  type PreparedAsset,
} from "@brains/assets";
import { z } from "@brains/utils/zod";

// Raw bytes; base64 plus the RPC envelope remain well below the 16 MiB frame cap.
export const ASSET_RPC_CHUNK_BYTES: number = 1024 * 1024;

export const assetChunkRangeSchema: z.ZodObject<{
  offset: z.ZodNumber;
  length: z.ZodNumber;
}> = z.strictObject({
  offset: z.number().int().min(0).max(MAX_ASSET_BYTES),
  length: z.number().int().min(1).max(ASSET_RPC_CHUNK_BYTES),
});

interface Upload {
  record: AssetRecord;
  bytes: Uint8Array;
  offset: number;
  connection: AbortSignal;
  consuming: boolean;
  releaseOnDisconnect: () => void;
}

/**
 * Ephemeral, owner-local upload assembly, never an independent durable store.
 * A socket's lifetime signal is its identity (not the peer's claimed session ID).
 * Quotas include uploads being consumed by an admitted entity transaction.
 */
export class EntityAssetTransfers {
  private readonly uploads = new Map<string, Upload>();
  private reservedBytes = 0;

  private readonly maxBytes: number;
  private readonly maxUploads: number;

  public constructor(
    maxBytes: number = MAX_ASSET_BYTES,
    maxUploads: number = 16,
  ) {
    this.maxBytes = maxBytes;
    this.maxUploads = maxUploads;
  }

  public begin(
    input: AssetRecord,
    connection: AbortSignal,
    id: string,
  ): string {
    connection.throwIfAborted();
    const record = assetRecordSchema.parse(input);
    if (
      record.sizeBytes > MAX_ASSET_BYTES ||
      record.sizeBytes > this.maxBytes - this.reservedBytes ||
      this.uploads.size >= this.maxUploads
    ) {
      throw new Error("Asset upload capacity exceeded");
    }
    z.string().uuid().parse(id);
    if (this.uploads.has(id)) throw new Error("Duplicate asset upload ID");
    const upload: Upload = {
      record,
      bytes: new Uint8Array(record.sizeBytes),
      offset: 0,
      connection,
      consuming: false,
      releaseOnDisconnect: () => {
        // An admitted mutation may still hold the bytes. Its finally owns release.
        if (!upload.consuming) this.release(id, upload);
      },
    };
    this.uploads.set(id, upload);
    this.reservedBytes += record.sizeBytes;
    connection.addEventListener("abort", upload.releaseOnDisconnect, {
      once: true,
    });
    return id;
  }

  public append(
    id: string,
    offset: number,
    bytes: Uint8Array,
    connection: AbortSignal,
  ): void {
    const upload = this.get(id, connection);
    if (upload.consuming)
      throw new Error("Asset upload is already being consumed");
    if (
      !Number.isSafeInteger(offset) ||
      offset !== upload.offset ||
      bytes.byteLength === 0 ||
      bytes.byteLength > ASSET_RPC_CHUNK_BYTES ||
      bytes.byteLength > upload.bytes.byteLength - upload.offset
    ) {
      this.release(id, upload);
      throw new Error("Invalid or out-of-order asset upload chunk");
    }
    upload.bytes.set(bytes, offset);
    upload.offset += bytes.byteLength;
  }

  public async consume<T>(
    id: string,
    connection: AbortSignal,
    mutation: (asset: PreparedAsset) => Promise<T>,
  ): Promise<T> {
    const upload = this.get(id, connection);
    if (upload.consuming)
      throw new Error("Asset upload is already being consumed");
    upload.consuming = true;
    try {
      if (upload.offset !== upload.record.sizeBytes)
        throw new Error("Asset upload is incomplete");
      if (computeAssetDigest(upload.bytes) !== upload.record.digest)
        throw new Error("Asset upload digest mismatch");
      connection.throwIfAborted();
      // The ordinary entity mutation validates and commits the bytes/reference
      // together. There is deliberately no upload-only durable publication.
      return await mutation({ ...upload.record, bytes: upload.bytes });
    } finally {
      this.release(id, upload);
    }
  }

  public discard(id: string, connection: AbortSignal): void {
    if (!this.uploads.has(id)) return;
    const upload = this.get(id, connection);
    if (!upload.consuming) this.release(id, upload);
  }

  private get(id: string, connection: AbortSignal): Upload {
    connection.throwIfAborted();
    const upload = this.uploads.get(id);
    if (upload?.connection !== connection)
      throw new Error("Unknown asset upload for this connection");
    return upload;
  }

  private release(id: string, upload: Upload): void {
    if (!this.uploads.delete(id)) return;
    upload.connection.removeEventListener("abort", upload.releaseOnDisconnect);
    this.reservedBytes -= upload.record.sizeBytes;
  }
}
