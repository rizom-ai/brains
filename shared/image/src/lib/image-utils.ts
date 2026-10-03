import { fetchAsBase64DataUrl, isHttpUrl } from "@brains/utils/http-utils";
import { objectEntries } from "@brains/utils/object-keys";
import { imageFormatSchema, type ImageFormat } from "../schemas/image";

/**
 * Parsed data URL result
 */
export interface ParsedDataUrl {
  format: string;
  base64: string;
}

/**
 * Parse a data URL into format and base64 components, or null when the
 * value is not a valid image data URL.
 */
export function tryParseDataUrl(dataUrl: string): ParsedDataUrl | null {
  // Trim surrounding whitespace: image entities store the bare data URL as
  // their content, so a filesystem round-trip (toMarkdown -> disk -> read)
  // appends a trailing newline that would otherwise fail the match.
  const match = dataUrl.trim().match(/^data:image\/([a-z+]+);base64,(.+)$/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    format: match[1].toLowerCase(),
    base64: match[2],
  };
}

/**
 * Parse a data URL into format and base64 components
 * @throws Error if not a valid image data URL
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const parsed = tryParseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error("Invalid image data URL");
  }
  return parsed;
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
const IMAGE_MAGIC_BYTES = {
  // PNG: 89 50 4E 47 = iVBORw
  png: "iVBORw",
  // JPEG: FF D8 FF = /9j/
  jpg: "/9j/",
  // GIF: 47 49 46 38 = R0lGOD
  gif: "R0lGOD",
  // WebP: 52 49 46 46 = UklGR (RIFF header)
  webp: "UklGR",
} satisfies Partial<Record<ImageFormat, string>>;

/**
 * Detect image format from base64 magic bytes
 * @returns format string or null if unknown
 */
export function detectImageFormat(base64: string): ImageFormat | null {
  for (const [format, magic] of objectEntries(IMAGE_MAGIC_BYTES)) {
    if (base64.startsWith(magic)) {
      return format;
    }
  }
  return null;
}

/**
 * Normalize a data-URL media subtype to a supported {@link ImageFormat}.
 *
 * Returns null for anything outside the union rather than asserting it: a
 * `data:image/bmp;...` URL parses fine but bmp is not a format this package
 * supports. `svg+xml` is the subtype SVG data URLs actually carry, while
 * ImageFormat spells it `svg`.
 */
export function toImageFormat(mediaSubtype: string): ImageFormat | null {
  const normalized = mediaSubtype.toLowerCase();
  const candidate = normalized === "svg+xml" ? "svg" : normalized;
  const parsed = imageFormatSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Check if string is a valid image data URL
 */
export function isValidDataUrl(str: string): boolean {
  return /^data:image\/[a-z+]+;base64,.+$/i.test(str);
}

export { isHttpUrl };

/**
 * Fetch an image from URL and return as base64 data URL.
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  return fetchAsBase64DataUrl(url, "image/");
}

/**
 * Detect a supported raster format from its leading signature bytes.
 * SVG and other formats return null.
 */
export function detectImageFormatFromBytes(
  bytes: Uint8Array,
): ImageFormat | null {
  const startsWith = (...magic: number[]): boolean =>
    magic.every((value, index) => bytes[index] === value);
  const ascii = (start: number, end: number): string =>
    Buffer.from(bytes.subarray(start, end)).toString("latin1");
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "png";
  if (startsWith(0xff, 0xd8, 0xff)) return "jpg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

/** The media type a stored image of this format is served as. */
export function imageMediaType(format: ImageFormat): string {
  switch (format) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    default:
      return `image/${format}`;
  }
}

/** A raster image's binary facts, read from its header bytes. */
export interface ImageByteDescription {
  format: ImageFormat;
  mediaType: string;
  width: number;
  height: number;
}

/**
 * Describe a supported raster image from its header bytes. Undefined when the
 * bytes are not a PNG, JPEG, GIF or WebP.
 */
export function describeImageBytes(
  header: Uint8Array,
): ImageByteDescription | undefined {
  const format = detectImageFormatFromBytes(header);
  if (!format) return undefined;
  const dimensions = detectImageDimensionsFromBytes(header);
  return {
    format,
    mediaType: imageMediaType(format),
    width: dimensions?.width ?? 0,
    height: dimensions?.height ?? 0,
  };
}

/** Bytes `start` (inclusive) to `end` (exclusive) of an image; shorter at its end. */
export type ImageByteReader = (
  start: number,
  end: number,
) => Promise<Uint8Array>;

type ByteRange = [start: number, end: number];
interface ImageDimensions {
  width: number;
  height: number;
}

/** Bytes PNG, GIF and WebP keep their size in; a JPEG walks its segments. */
const FIXED_HEADER_BYTES = 64;

/**
 * Describe a supported raster image by reading only the bytes that carry its
 * facts: a JPEG's frame header is found by skipping whole segments, however
 * much metadata precedes it. Undefined when it is not a PNG, JPEG, GIF or WebP.
 */
export async function describeImage(
  read: ImageByteReader,
): Promise<ImageByteDescription | undefined> {
  const header = await read(0, FIXED_HEADER_BYTES);
  const format = detectImageFormatFromBytes(header);
  if (!format) return undefined;
  const dimensions =
    format === "jpg" || format === "jpeg"
      ? await readJpegFrameSize(read)
      : detectImageDimensionsFromBytes(header);
  return {
    format,
    mediaType: imageMediaType(format),
    width: dimensions?.width ?? 0,
    height: dimensions?.height ?? 0,
  };
}

/** Read ranges of bytes held in memory. */
export function bytesImageReader(bytes: Uint8Array): ImageByteReader {
  return async (start, end): Promise<Uint8Array> => bytes.subarray(start, end);
}

/** Read ranges of a base64 payload, decoding only the characters they span. */
export function base64ImageReader(base64: string): ImageByteReader {
  const payload = /\s/.test(base64) ? base64.replace(/\s/g, "") : base64;
  return async (start, end): Promise<Uint8Array> => {
    const first = Math.floor(start / 3);
    const decoded = Buffer.from(
      payload.slice(first * 4, Math.ceil(end / 3) * 4),
      "base64",
    );
    return decoded.subarray(start - first * 3, end - first * 3);
  };
}

/** Read ranges of a file without loading it. */
export function fileImageReader(path: string): ImageByteReader {
  return (start, end): Promise<Uint8Array> =>
    Bun.file(path).slice(start, end).bytes();
}

async function readJpegFrameSize(
  read: ImageByteReader,
): Promise<ImageDimensions | null> {
  const walk = jpegFrameSize(2);
  const step = async (
    next: IteratorResult<ByteRange, ImageDimensions | null>,
  ): Promise<ImageDimensions | null> =>
    next.done ? next.value : step(walk.next(await read(...next.value)));
  return step(walk.next(new Uint8Array()));
}

/**
 * Walk a JPEG's segments from `offset` by their declared lengths, asking for
 * only the bytes each step needs, until a frame header gives the size. EXIF
 * thumbnails sit inside APP payloads, so their frame headers are skipped.
 */
function* jpegFrameSize(
  offset: number,
): Generator<ByteRange, ImageDimensions | null, Uint8Array> {
  const marker = Buffer.from(yield [offset, offset + 4]);
  if (marker.byteLength < 2 || marker[0] !== 0xff) return null;
  const code = marker[1] ?? 0;
  // Fill bytes pad between segments.
  if (code === 0xff) return yield* jpegFrameSize(offset + 1);
  // Standalone markers carry no length.
  if (code === 0x01 || (code >= 0xd0 && code <= 0xd7)) {
    return yield* jpegFrameSize(offset + 2);
  }
  // Scan data or the end of the image: no frame header came first.
  if (code === 0xda || code === 0xd9) return null;
  if (marker.byteLength < 4) return null;
  // Every SOFn except DHT (C4), JPG (C8) and DAC (CC) carries the frame size.
  if (code >= 0xc0 && code <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(code)) {
    const size = Buffer.from(yield [offset + 5, offset + 9]);
    if (size.byteLength < 4) return null;
    return { height: size.readUInt16BE(0), width: size.readUInt16BE(2) };
  }
  const length = marker.readUInt16BE(2);
  if (length < 2) return null;
  return yield* jpegFrameSize(offset + 2 + length);
}

/**
 * Get image dimensions from base64 data
 * Parses image headers to extract width/height without full decode
 */
export function detectImageDimensions(
  base64: string,
): { width: number; height: number } | null {
  return detectImageDimensionsFromBytes(Buffer.from(base64, "base64"));
}

/** Read width/height from image headers without decoding pixels. */
export function detectImageDimensionsFromBytes(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

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

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const walk = jpegFrameSize(2);
    const step = (
      next: IteratorResult<ByteRange, ImageDimensions | null>,
    ): ImageDimensions | null =>
      next.done ? next.value : step(walk.next(buffer.subarray(...next.value)));
    return step(walk.next(new Uint8Array()));
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
