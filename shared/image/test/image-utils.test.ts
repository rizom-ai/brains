import { describe, expect, it } from "bun:test";
import {
  parseDataUrl,
  createDataUrl,
  base64ImageReader,
  bytesImageReader,
  describeImage,
  describeImageBytes,
  detectImageDimensionsFromBytes,
  type ImageByteReader,
  detectImageFormat,
  detectImageFormatFromBytes,
  imageMediaType,
  isValidDataUrl,
  toImageFormat,
} from "../src/lib/image-utils";
import { jpeg, jpegFrame, jpegMetadata, jpegSegment } from "./fixtures/jpeg";

describe("toImageFormat", () => {
  it("accepts the supported formats", () => {
    expect(toImageFormat("png")).toBe("png");
    expect(toImageFormat("jpeg")).toBe("jpeg");
    expect(toImageFormat("jpg")).toBe("jpg");
    expect(toImageFormat("webp")).toBe("webp");
    expect(toImageFormat("gif")).toBe("gif");
  });

  it("normalizes the svg+xml media subtype to svg", () => {
    expect(toImageFormat("svg+xml")).toBe("svg");
    expect(toImageFormat("SVG+XML")).toBe("svg");
  });

  it("rejects media subtypes outside the supported union", () => {
    expect(toImageFormat("bmp")).toBeNull();
    expect(toImageFormat("tiff")).toBeNull();
    expect(toImageFormat("")).toBeNull();
  });
});

// Minimal 1x1 pixel PNG (base64)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

// Minimal 1x1 pixel JPEG (base64)
const TINY_JPG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADBAB//9k=";

describe("parseDataUrl", () => {
  it("should parse PNG data URL", () => {
    const result = parseDataUrl(TINY_PNG_DATA_URL);
    expect(result.format).toBe("png");
    expect(result.base64).toBe(TINY_PNG_BASE64);
  });

  it("should parse JPEG data URL", () => {
    const dataUrl = `data:image/jpeg;base64,${TINY_JPG_BASE64}`;
    const result = parseDataUrl(dataUrl);
    expect(result.format).toBe("jpeg");
    expect(result.base64).toBe(TINY_JPG_BASE64);
  });

  it("should parse WebP data URL", () => {
    const dataUrl = "data:image/webp;base64,abc123";
    const result = parseDataUrl(dataUrl);
    expect(result.format).toBe("webp");
    expect(result.base64).toBe("abc123");
  });

  it("should parse a data URL with a trailing newline (filesystem round-trip)", () => {
    // Image entities store the bare data URL as content; writing it to disk
    // appends a trailing newline that must not break re-parsing.
    const result = parseDataUrl(`${TINY_PNG_DATA_URL}\n`);
    expect(result.format).toBe("png");
    expect(result.base64).toBe(TINY_PNG_BASE64);
  });

  it("should throw for invalid data URL", () => {
    expect(() => parseDataUrl("https://example.com/image.png")).toThrow();
    expect(() => parseDataUrl("not-a-data-url")).toThrow();
  });

  it("should throw for non-image data URL", () => {
    expect(() => parseDataUrl("data:text/plain;base64,abc")).toThrow();
  });
});

describe("createDataUrl", () => {
  it("should create PNG data URL", () => {
    const result = createDataUrl(TINY_PNG_BASE64, "png");
    expect(result).toBe(TINY_PNG_DATA_URL);
  });

  it("should create JPEG data URL", () => {
    const result = createDataUrl(TINY_JPG_BASE64, "jpeg");
    expect(result).toBe(`data:image/jpeg;base64,${TINY_JPG_BASE64}`);
  });

  it("should handle jpg as jpeg", () => {
    const result = createDataUrl("abc", "jpg");
    expect(result).toBe("data:image/jpeg;base64,abc");
  });
});

describe("detectImageFormat", () => {
  it("should detect PNG from magic bytes", () => {
    const format = detectImageFormat(TINY_PNG_BASE64);
    expect(format).toBe("png");
  });

  it("should detect JPEG from magic bytes", () => {
    const format = detectImageFormat(TINY_JPG_BASE64);
    expect(format).toBe("jpg");
  });

  it("should return null for unknown format", () => {
    const format = detectImageFormat("YWJjZGVm"); // "abcdef" in base64
    expect(format).toBeNull();
  });
});

describe("detectImageFormatFromBytes", () => {
  const withMagic = (...magic: number[]): Uint8Array =>
    Uint8Array.from([...magic, ...new Array<number>(16).fill(0)]);

  it("detects the supported raster formats from their signatures", () => {
    expect(detectImageFormatFromBytes(withMagic(0x89, 0x50, 0x4e, 0x47))).toBe(
      "png",
    );
    expect(detectImageFormatFromBytes(withMagic(0xff, 0xd8, 0xff))).toBe("jpg");
    expect(detectImageFormatFromBytes(withMagic(0x47, 0x49, 0x46, 0x38))).toBe(
      "gif",
    );
    const webp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4),
      Buffer.from("WEBPVP8 "),
    ]);
    expect(detectImageFormatFromBytes(webp)).toBe("webp");
  });

  it("returns null for anything else, including RIFF containers that are not WebP", () => {
    expect(detectImageFormatFromBytes(Buffer.from("<svg></svg>"))).toBeNull();
    const wave = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4),
      Buffer.from("WAVEfmt "),
    ]);
    expect(detectImageFormatFromBytes(wave)).toBeNull();
  });
});

describe("detectImageDimensionsFromBytes", () => {
  it("reads PNG dimensions from the header", () => {
    expect(
      detectImageDimensionsFromBytes(Buffer.from(TINY_PNG_BASE64, "base64")),
    ).toEqual({ width: 1, height: 1 });
  });
});

describe("describeImageBytes", () => {
  it("reads format, media type and dimensions from header bytes", () => {
    expect(describeImageBytes(Buffer.from(TINY_PNG_BASE64, "base64"))).toEqual({
      format: "png",
      mediaType: "image/png",
      width: 1,
      height: 1,
    });
  });

  it("refuses bytes that are not a supported raster image", () => {
    expect(describeImageBytes(Buffer.from("not an image"))).toBeUndefined();
  });
});

describe("imageMediaType", () => {
  it("maps formats to their media types", () => {
    expect(imageMediaType("png")).toBe("image/png");
    expect(imageMediaType("jpg")).toBe("image/jpeg");
    expect(imageMediaType("jpeg")).toBe("image/jpeg");
    expect(imageMediaType("webp")).toBe("image/webp");
    expect(imageMediaType("gif")).toBe("image/gif");
    expect(imageMediaType("svg")).toBe("image/svg+xml");
  });
});

describe("isValidDataUrl", () => {
  it("should return true for valid image data URL", () => {
    expect(isValidDataUrl(TINY_PNG_DATA_URL)).toBe(true);
  });

  it("should return false for HTTP URL", () => {
    expect(isValidDataUrl("https://example.com/image.png")).toBe(false);
  });

  it("should return false for non-image data URL", () => {
    expect(isValidDataUrl("data:text/plain;base64,abc")).toBe(false);
  });
});

function countingReader(read: ImageByteReader): {
  read: ImageByteReader;
  bytes: () => number;
} {
  let bytes = 0;
  return {
    read: async (start, end): Promise<Uint8Array> => {
      const chunk = await read(start, end);
      bytes += chunk.byteLength;
      return chunk;
    },
    bytes: () => bytes,
  };
}

describe("describeImage", () => {
  it("finds a JPEG frame behind more than 256 KiB of metadata", async () => {
    const image = jpeg(...jpegMetadata(400 * 1024), jpegFrame(4032, 3024));

    expect(await describeImage(bytesImageReader(image))).toEqual({
      format: "jpg",
      mediaType: "image/jpeg",
      width: 4032,
      height: 3024,
    });
    expect(detectImageDimensionsFromBytes(image)).toEqual({
      width: 4032,
      height: 3024,
    });
  });

  it("skips a thumbnail's frame header inside an EXIF segment", async () => {
    const thumbnail = jpeg(jpegFrame(160, 120));
    const image = jpeg(jpegSegment(0xe1, thumbnail), jpegFrame(4032, 3024));

    expect(detectImageDimensionsFromBytes(image)).toEqual({
      width: 4032,
      height: 3024,
    });
    expect(await describeImage(bytesImageReader(image))).toMatchObject({
      width: 4032,
      height: 3024,
    });
  });

  it("reads only segment headers, not the metadata between them", async () => {
    const image = jpeg(...jpegMetadata(400 * 1024), jpegFrame(800, 600));
    const counting = countingReader(bytesImageReader(image));

    await describeImage(counting.read);

    expect(counting.bytes()).toBeLessThan(1024);
  });

  it("decodes only the requested ranges of a base64 payload", async () => {
    const image = jpeg(...jpegMetadata(300 * 1024), jpegFrame(1920, 1080));
    const reader = base64ImageReader(image.toString("base64"));

    expect(await describeImage(reader)).toMatchObject({
      width: 1920,
      height: 1080,
    });
    expect(Buffer.from(await reader(5, 17)).equals(image.subarray(5, 17))).toBe(
      true,
    );
  });

  it("describes nothing that is not a supported image", async () => {
    expect(
      await describeImage(bytesImageReader(Buffer.from("not an image"))),
    ).toBeUndefined();
  });
});
