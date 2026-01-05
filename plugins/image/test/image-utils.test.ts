import { describe, expect, it } from "bun:test";
import {
  parseDataUrl,
  createDataUrl,
  detectImageFormat,
  isValidDataUrl,
} from "../src/lib/image-utils";

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
