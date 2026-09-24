import { assetRefSchema, type AssetRef } from "@brains/assets";
import { isHttpUrl } from "@brains/utils/http-utils";
import type { ImageFormat, ImageMediaType } from "../schemas/image";

const IMAGE_MEDIA_TYPES: Record<ImageFormat, ImageMediaType> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export interface InspectedImage {
  format: ImageFormat;
  mediaType: ImageMediaType;
  sizeBytes: number;
  width: number;
  height: number;
}

function normalizeDeclaredMediaType(value: string): ImageMediaType | undefined {
  const normalized =
    value.toLowerCase() === "image/jpg" ? "image/jpeg" : value.toLowerCase();
  switch (normalized) {
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
      return normalized;
    default:
      return undefined;
  }
}

/** Detect a supported image format from binary signatures in ingestion actors. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }

  if (
    bytes.byteLength >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "gif";
  }

  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

/** Extract dimensions from a bounded binary header. */
export function detectImageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = detectImageFormat(bytes);

  if (format === "png") {
    if (buffer.byteLength < 24) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (format === "jpeg") {
    let offset = 2;
    const startOfFrameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
      0xcf,
    ]);
    while (offset + 8 < buffer.byteLength) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (buffer[offset] === 0xff) offset++;
      const marker = buffer[offset];
      if (marker === undefined || marker === 0xd9 || marker === 0xda)
        return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset++;
        continue;
      }
      if (offset + 2 >= buffer.byteLength) return null;
      const segmentLength = buffer.readUInt16BE(offset + 1);
      if (segmentLength < 2) return null;
      if (startOfFrameMarkers.has(marker)) {
        if (offset + 7 >= buffer.byteLength) return null;
        return {
          height: buffer.readUInt16BE(offset + 4),
          width: buffer.readUInt16BE(offset + 6),
        };
      }
      offset += 1 + segmentLength;
    }
    return null;
  }

  if (format === "gif") {
    if (buffer.byteLength < 10) return null;
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  if (format === "webp") {
    if (buffer.byteLength < 30) return null;
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8 ") {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      if (buffer[20] !== 0x2f) return null;
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
  }

  return null;
}

/** Validate signature, declared MIME type, and dimensions without decoding pixels. */
export function inspectImageBytes(
  bytes: Uint8Array,
  declaredMediaType?: string,
): InspectedImage {
  const format = detectImageFormat(bytes);
  if (!format) throw new Error("Unsupported image signature");

  const mediaType = IMAGE_MEDIA_TYPES[format];
  if (declaredMediaType !== undefined) {
    const normalized = normalizeDeclaredMediaType(declaredMediaType);
    if (!normalized)
      throw new Error(`Unsupported image media type: ${declaredMediaType}`);
    if (normalized !== mediaType) {
      throw new Error(
        `Image media type ${declaredMediaType} does not match ${mediaType} signature`,
      );
    }
  }

  const dimensions = detectImageDimensions(bytes);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error("Could not detect valid image dimensions");
  }

  return {
    format,
    mediaType,
    sizeBytes: bytes.byteLength,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export { isHttpUrl };

export function isAssetImageContent(content: string): content is AssetRef {
  return assetRefSchema.safeParse(content.trim()).success;
}
