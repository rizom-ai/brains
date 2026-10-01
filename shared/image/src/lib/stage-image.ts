import {
  base64AssetSource,
  type AssetSource,
  type StageAssetOptions,
  type StagedAsset,
} from "@brains/entity-service";
import { imageAdapter, type ImageDescription } from "../adapters/image-adapter";
import type { Image } from "../schemas/image";
import {
  detectImageFormatFromBytes,
  IMAGE_HEADER_BYTES,
  parseDataUrl,
} from "./image-utils";

/**
 * Largest image stored as a new asset. Staging keeps event-loop stalls
 * independent of size; this bounds consumers that still need whole buffers.
 */
export const IMAGE_ASSET_MAX_BYTES: number = 25 * 1024 * 1024;

/** Base64 characters decoded up front to read an image's header bytes. */
const HEADER_BASE64_CHARS = Math.ceil(IMAGE_HEADER_BYTES / 3) * 4;

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
  const { header, bytes } = openImageSource(source);
  if (!detectImageFormatFromBytes(header)) {
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
      bytes: header,
    }),
  };
}

function openImageSource(source: ImageBytesSource): {
  header: Uint8Array;
  bytes: AssetSource;
} {
  if ("bytes" in source) return { header: source.bytes, bytes: source.bytes };
  const { base64 } = parseDataUrl(source.dataUrl);
  return {
    header: Buffer.from(base64.slice(0, HEADER_BASE64_CHARS), "base64"),
    bytes: base64AssetSource(base64),
  };
}
