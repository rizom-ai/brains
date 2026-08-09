import type {
  AssetPutStreamOptions,
  AssetRecord,
  AssetRef,
  AssetStat,
  AssetStore,
  AssetVerification,
} from "@brains/assets";
import type { Logger } from "@brains/utils/logger";

/**
 * Ceiling applied to plugin asset writes that do not declare their own limit.
 * A plugin streaming from an untrusted source (an upload, a remote fetch) would
 * otherwise be able to fill the persisted volume before anyone noticed. Callers
 * with a legitimately larger payload pass an explicit `maxBytes`.
 */
export const defaultPluginAssetMaxBytes: number = 64 * 1024 * 1024;

/**
 * Bounded plugin view of the shell-owned asset store. Plugins get durable byte
 * storage without holding the service itself, so write policy and attribution
 * stay owned by the shell.
 */
export interface IAssetsNamespace {
  put(bytes: Uint8Array, options?: AssetPutStreamOptions): Promise<AssetRecord>;
  putStream(
    chunks: AsyncIterable<Uint8Array>,
    options?: AssetPutStreamOptions,
  ): Promise<AssetRecord>;
  read(ref: AssetRef): Promise<Uint8Array>;
  stat(ref: AssetRef): Promise<AssetStat | null>;
  verify(ref: AssetRef): Promise<AssetVerification>;
}

function withDefaultCeiling(
  options: AssetPutStreamOptions | undefined,
): AssetPutStreamOptions {
  return {
    ...options,
    maxBytes: options?.maxBytes ?? defaultPluginAssetMaxBytes,
  };
}

export function createAssetsNamespace(
  store: AssetStore,
  pluginId: string,
  logger: Logger,
): IAssetsNamespace {
  const recordWrite = (record: AssetRecord): AssetRecord => {
    logger.debug("Plugin wrote durable asset", {
      pluginId,
      digest: record.digest,
      sizeBytes: record.sizeBytes,
    });
    return record;
  };

  return {
    put: async (
      bytes: Uint8Array,
      options?: AssetPutStreamOptions,
    ): Promise<AssetRecord> => {
      async function* single(): AsyncGenerator<Uint8Array> {
        yield bytes;
      }
      const record = await store.putStream(single(), {
        ...withDefaultCeiling(options),
        expectedSize: bytes.byteLength,
      });
      return recordWrite(record);
    },
    putStream: async (
      chunks: AsyncIterable<Uint8Array>,
      options?: AssetPutStreamOptions,
    ): Promise<AssetRecord> =>
      recordWrite(await store.putStream(chunks, withDefaultCeiling(options))),
    read: (ref: AssetRef): Promise<Uint8Array> => store.read(ref),
    stat: (ref: AssetRef): Promise<AssetStat | null> => store.stat(ref),
    verify: (ref: AssetRef): Promise<AssetVerification> => store.verify(ref),
  };
}
