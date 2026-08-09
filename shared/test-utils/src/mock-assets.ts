import { createHash } from "node:crypto";
import {
  createAssetRef,
  getAssetDigest,
  type AssetPutStreamOptions,
  type AssetRecord,
  type AssetRef,
  type AssetStat,
  type AssetStore,
  type AssetVerification,
  type IAssetsNamespace,
} from "@brains/plugins";

export interface MockAssetStore extends AssetStore {
  readonly contents: ReadonlyMap<AssetRef, Uint8Array>;
  seed(bytes: Uint8Array): {
    ref: AssetRef;
    digest: string;
    sizeBytes: number;
  };
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes);
}

function assertSize(
  sizeBytes: number,
  options: AssetPutStreamOptions | undefined,
): void {
  if (options?.maxBytes !== undefined && sizeBytes > options.maxBytes) {
    throw new Error(`Asset exceeds maximum size of ${options.maxBytes} bytes`);
  }
  if (
    options?.expectedSize !== undefined &&
    sizeBytes !== options.expectedSize
  ) {
    throw new Error(
      `Asset size ${sizeBytes} does not match expected size ${options.expectedSize}`,
    );
  }
}

/**
 * Smallest valid 1x1 PNG. Asset fixtures must hold real image bytes because
 * readers validate binary signatures, not just declared media types.
 */
export const TINY_PNG_BYTES: Uint8Array = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

/** Deterministic in-memory asset store for behavior-focused tests. */
export function createMockAssetStore(): MockAssetStore {
  const contents = new Map<AssetRef, Uint8Array>();

  const putBytes = (
    bytes: Uint8Array,
  ): {
    ref: AssetRef;
    digest: string;
    sizeBytes: number;
  } => {
    const digest = createHash("sha256").update(bytes).digest("hex");
    const ref = createAssetRef(digest);
    contents.set(ref, copyBytes(bytes));
    return { ref, digest, sizeBytes: bytes.byteLength };
  };

  return {
    contents,
    seed: putBytes,
    // Mirrors the real store: expectedSize is computed from the payload, so
    // only the byte-policy options apply.
    put: async (bytes, options): Promise<AssetRecord> => {
      assertSize(bytes.byteLength, {
        ...(options?.maxBytes !== undefined && { maxBytes: options.maxBytes }),
      });
      return putBytes(bytes);
    },
    putStream: async (chunks, options): Promise<AssetRecord> => {
      const collected: Uint8Array[] = [];
      let sizeBytes = 0;
      for await (const chunk of chunks) {
        sizeBytes += chunk.byteLength;
        assertSize(sizeBytes, {
          ...(options?.maxBytes !== undefined && {
            maxBytes: options.maxBytes,
          }),
        });
        collected.push(copyBytes(chunk));
      }
      assertSize(sizeBytes, options);
      const bytes = new Uint8Array(sizeBytes);
      let offset = 0;
      for (const chunk of collected) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return putBytes(bytes);
    },
    read: async (ref): Promise<Uint8Array> => {
      const bytes = contents.get(ref);
      if (!bytes) throw new Error(`Mock asset not found: ${ref}`);
      return copyBytes(bytes);
    },
    stat: async (ref): Promise<AssetStat | null> => {
      const bytes = contents.get(ref);
      return bytes ? { ref, sizeBytes: bytes.byteLength } : null;
    },
    verify: async (ref): Promise<AssetVerification> => {
      const bytes = contents.get(ref);
      if (!bytes) throw new Error(`Mock asset not found: ${ref}`);
      const expectedDigest = getAssetDigest(ref);
      const actualDigest = createHash("sha256").update(bytes).digest("hex");
      return {
        ref,
        sizeBytes: bytes.byteLength,
        expectedDigest,
        actualDigest,
        valid: expectedDigest === actualDigest,
      };
    },
  };
}

export interface MockAssetsNamespace extends IAssetsNamespace {
  readonly store: MockAssetStore;
}

export function createMockAssetsNamespace(
  store: MockAssetStore = createMockAssetStore(),
): MockAssetsNamespace {
  return {
    store,
    put: (bytes, options): Promise<AssetRecord> => store.put(bytes, options),
    putStream: (chunks, options) => store.putStream(chunks, options),
    read: (ref) => store.read(ref),
    stat: (ref) => store.stat(ref),
    verify: (ref) => store.verify(ref),
  };
}
