import {
  MAX_ASSET_BYTES,
  chunkAssetSource,
  computeAssetDigest,
  createAssetRef,
  resolveAssetStageLimits,
  type AssetRef,
  type AssetSource,
  type StageAssetOptions,
  type StagedAsset,
} from "@brains/assets";

/** The asset surface an entity-service double shares with the real one. */
export interface MockAssetStore {
  stageAsset(
    source: AssetSource,
    options?: StageAssetOptions,
  ): Promise<StagedAsset>;
  discardStagedAsset(asset: StagedAsset): Promise<void>;
  openAsset(ref: AssetRef): Promise<AsyncIterable<Uint8Array>>;
}

/**
 * In-memory staging for entity-service doubles: bytes are kept under their
 * digest and streamed back in chunks. Limits apply as in the real repository.
 */
export function createMockAssetStore(): MockAssetStore {
  const assets = new Map<AssetRef, Buffer>();
  return {
    async stageAsset(source, options = {}): Promise<StagedAsset> {
      const limits = resolveAssetStageLimits(options, MAX_ASSET_BYTES);
      const chunks: Uint8Array[] = [];
      for await (const chunk of chunkAssetSource(source)) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      if (bytes.byteLength > limits.maxBytes) {
        throw new Error(
          `Asset exceeds ${limits.maxBytes}-byte limit: received more than ${limits.maxBytes} bytes`,
        );
      }
      if (
        limits.expectedSize !== undefined &&
        bytes.byteLength !== limits.expectedSize
      ) {
        throw new Error(
          `Asset size mismatch: expected ${limits.expectedSize} bytes, received ${bytes.byteLength}`,
        );
      }
      const digest = computeAssetDigest(bytes);
      const ref = createAssetRef(digest);
      assets.set(ref, bytes);
      return Object.freeze({ ref, digest, sizeBytes: bytes.byteLength });
    },
    // Staged bytes live under their digest, shared with any published copy.
    async discardStagedAsset(): Promise<void> {},
    async openAsset(ref): Promise<AsyncIterable<Uint8Array>> {
      const bytes = assets.get(ref);
      if (!bytes) throw new Error(`Asset not found: ${ref}`);
      return chunkAssetSource(bytes);
    },
  };
}
