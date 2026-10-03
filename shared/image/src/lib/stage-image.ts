import {
  base64AssetSource,
  type AssetSource,
  type StageAssetOptions,
  type StagedAsset,
} from "@brains/entity-service";
import { imageAdapter, type ImageDescription } from "../adapters/image-adapter";
import type { Image } from "../schemas/image";
import {
  base64ImageReader,
  bytesImageReader,
  describeImage,
  parseDataUrl,
  type ImageByteReader,
} from "./image-utils";

/**
 * Largest image stored as a new asset. Staging keeps event-loop stalls
 * independent of size; this bounds consumers that still need whole buffers.
 */
export const IMAGE_ASSET_MAX_BYTES: number = 25 * 1024 * 1024;

/** The staging half of the entity service. */
export interface ImageAssetStager {
  stageAsset(
    source: AssetSource,
    options?: StageAssetOptions,
  ): Promise<StagedAsset>;
}

/** Image bytes in hand, or a provider data URL decoded while staging. */
export type ImageBytesSource = { bytes: Uint8Array } | { dataUrl: string };

export interface StagedImageEntity {
  entity: Pick<Image, "entityType" | "content" | "metadata">;
  stagedAsset: StagedAsset;
}

/**
 * Stage image bytes and describe them. Unsupported formats fail before any
 * bytes are written; publish the result by passing `stagedAsset` with the
 * entity to create, update or upsert.
 */
export async function stageImageEntity(
  stager: ImageAssetStager,
  source: ImageBytesSource,
  description: ImageDescription,
): Promise<StagedImageEntity> {
  const { read, bytes } = openImageSource(source);
  const facts = await describeImage(read);
  if (!facts) {
    throw new Error("Unsupported image format: not a PNG, JPEG, GIF or WebP");
  }
  const stagedAsset = await stager.stageAsset(bytes, {
    maxBytes: IMAGE_ASSET_MAX_BYTES,
  });
  return {
    stagedAsset,
    entity: imageAdapter.createAssetImageEntity({
      ...description,
      asset: stagedAsset,
      description: facts,
    }),
  };
}

function openImageSource(source: ImageBytesSource): {
  read: ImageByteReader;
  bytes: AssetSource;
} {
  if ("bytes" in source) {
    return { read: bytesImageReader(source.bytes), bytes: source.bytes };
  }
  const { base64 } = parseDataUrl(source.dataUrl);
  return { read: base64ImageReader(base64), bytes: base64AssetSource(base64) };
}
