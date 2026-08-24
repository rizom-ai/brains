import {
  detectImageDimensions,
  detectImageFormat,
  parseDataUrl,
} from "./image-utils";
import type { ImageFormat } from "../schemas/image";

/**
 * What an image's bytes say about themselves.
 *
 * Format, width, and height are required metadata and never supplied by a
 * caller — they are read out of the data URL. Detection wins over the
 * declared media type, because a provider that labels a JPEG as PNG is wrong
 * about its own output and the bytes are not.
 *
 * All that survives of the hand-written `ImageAdapter`: the declarative
 * runtime builds adapters from entity definitions now, but deriving these
 * three fields is a fact about image bytes rather than about any one
 * package, and two packages write images.
 */
export function imageMetadataFor(
  dataUrl: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const { format, base64 } = parseDataUrl(dataUrl);
  const dimensions = detectImageDimensions(base64);
  return {
    format: (detectImageFormat(base64) ?? format) as ImageFormat,
    width: dimensions?.width ?? 0,
    height: dimensions?.height ?? 0,
    ...extra,
  };
}

export function imageDataUrl(mediaType: string, content: Buffer): string {
  return `data:${mediaType};base64,${content.toString("base64")}`;
}
