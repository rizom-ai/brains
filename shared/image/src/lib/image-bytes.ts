import {
  assetRefSchema,
  readAssetBytes,
  type AssetOpener,
} from "@brains/entity-service";
import { imageFormatSchema } from "../schemas/image";
import { imageMediaType, tryParseDataUrl, toImageFormat } from "./image-utils";

/** The stored fields of an image entity, read in reference mode. */
export interface StoredImage {
  content: string;
  metadata: Record<string, unknown>;
}

export interface ImageBytes {
  bytes: Buffer;
  mediaType: string;
}

/**
 * An image's bytes, whether stored as an asset or as an inline data URL.
 * Undefined when the content is neither.
 */
export async function readImageBytes(
  reader: AssetOpener,
  image: StoredImage,
): Promise<ImageBytes | undefined> {
  const ref = assetRefSchema.safeParse(image.content);
  if (!ref.success) {
    const parsed = tryParseDataUrl(image.content);
    if (!parsed) return undefined;
    const format = toImageFormat(parsed.format);
    return {
      bytes: Buffer.from(parsed.base64, "base64"),
      mediaType: format ? imageMediaType(format) : `image/${parsed.format}`,
    };
  }
  return {
    bytes: await readAssetBytes(reader, ref.data),
    mediaType: storedMediaType(image),
  };
}

/**
 * A data URL for rendering an image inline. An inline data URL is returned
 * as stored; an asset is encoded explicitly here, at the render boundary.
 */
export async function imageDataUrl(
  reader: AssetOpener,
  image: StoredImage,
): Promise<string | undefined> {
  if (!assetRefSchema.safeParse(image.content).success) {
    return tryParseDataUrl(image.content) ? image.content : undefined;
  }
  const read = await readImageBytes(reader, image);
  return (
    read && `data:${read.mediaType};base64,${read.bytes.toString("base64")}`
  );
}

function storedMediaType(image: StoredImage): string {
  const mediaType = image.metadata["mediaType"];
  if (typeof mediaType === "string") return mediaType;
  const format = imageFormatSchema.safeParse(image.metadata["format"]);
  return format.success ? imageMediaType(format.data) : "image/png";
}
