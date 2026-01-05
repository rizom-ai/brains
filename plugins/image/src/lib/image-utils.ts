import type { ImageFormat } from "../schemas/image";

/**
 * Parsed data URL result
 */
export interface ParsedDataUrl {
  format: string;
  base64: string;
}

/**
 * Parse a data URL into format and base64 components
 * @throws Error if not a valid image data URL
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = dataUrl.match(/^data:image\/([a-z+]+);base64,(.+)$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error("Invalid image data URL");
  }
  return {
    format: match[1].toLowerCase(),
    base64: match[2],
  };
}

/**
 * Create a data URL from base64 and format
 */
export function createDataUrl(
  base64: string,
  format: ImageFormat | string,
): string {
  // Normalize jpg to jpeg for MIME type
  const mimeFormat = format === "jpg" ? "jpeg" : format;
  return `data:image/${mimeFormat};base64,${base64}`;
}

/**
 * Magic bytes for common image formats
 */
const IMAGE_MAGIC_BYTES: Record<string, string> = {
  // PNG: 89 50 4E 47 = iVBORw
  png: "iVBORw",
  // JPEG: FF D8 FF = /9j/
  jpg: "/9j/",
  // GIF: 47 49 46 38 = R0lGOD
  gif: "R0lGOD",
  // WebP: 52 49 46 46 = UklGR (RIFF header)
  webp: "UklGR",
};

/**
 * Detect image format from base64 magic bytes
 * @returns format string or null if unknown
 */
export function detectImageFormat(base64: string): ImageFormat | null {
  for (const [format, magic] of Object.entries(IMAGE_MAGIC_BYTES)) {
    if (base64.startsWith(magic)) {
      return format as ImageFormat;
    }
  }
  return null;
}

/**
 * Check if string is a valid image data URL
 */
export function isValidDataUrl(str: string): boolean {
  return /^data:image\/[a-z+]+;base64,.+$/i.test(str);
}

/**
 * Check if string is an HTTP(S) URL
 */
export function isHttpUrl(str: string): boolean {
  return /^https?:\/\//i.test(str);
}

/**
 * Fetch an image from URL and return as base64 data URL
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type");
  if (!contentType?.startsWith("image/")) {
    throw new Error(`URL does not point to an image: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // Extract format from content-type (e.g., "image/png" -> "png")
  const format = contentType.split("/")[1]?.split(";")[0] ?? "png";

  return createDataUrl(base64, format);
}

/**
 * Get image dimensions from base64 data
 * Parses image headers to extract width/height without full decode
 */
export function detectImageDimensions(
  base64: string,
): { width: number; height: number } | null {
  const buffer = Buffer.from(base64, "base64");

  // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: Need to scan for SOF0/SOF2 marker
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF0 (0xC0) or SOF2 (0xC2) - Start of Frame
      if (marker === 0xc0 || marker === 0xc2) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      // Skip to next marker
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    }
  }

  // GIF: width at bytes 6-7, height at bytes 8-9 (little-endian)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    return { width, height };
  }

  // WebP: RIFF header, check for VP8 chunk
  if (
    buffer.length >= 30 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    // VP8 (lossy): width/height at specific offsets
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38) {
      // VP8 chunk
      if (buffer[15] === 0x20) {
        // VP8 lossy
        // Frame header starts at offset 23
        const b26 = buffer[26] ?? 0;
        const b27 = buffer[27] ?? 0;
        const b28 = buffer[28] ?? 0;
        const b29 = buffer[29] ?? 0;
        const width = (b26 | (b27 << 8)) & 0x3fff;
        const height = (b28 | (b29 << 8)) & 0x3fff;
        return { width, height };
      }
      // VP8L (lossless)
      if (buffer[15] === 0x4c && buffer.length >= 25) {
        const bits = buffer.readUInt32LE(21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
      }
    }
  }

  return null;
}
