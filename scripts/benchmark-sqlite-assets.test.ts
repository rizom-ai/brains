import { describe, expect, it } from "bun:test";
import { formatBytes, parseImageDataUrl } from "./benchmark-sqlite-assets";

describe("SQLite asset benchmark helpers", () => {
  it("decodes supported image data URLs", () => {
    const parsed = parseImageDataUrl(
      "data:image/png;base64," + Buffer.from("png-bytes").toString("base64"),
    );

    expect(parsed.mediaType).toBe("image/png");
    expect(Buffer.from(parsed.bytes).toString("utf8")).toBe("png-bytes");
  });

  it("rejects unsupported and non-base64 inputs", () => {
    expect(() =>
      parseImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="),
    ).toThrow("supported base64 image data URL");
    expect(() => parseImageDataUrl("https://example.com/image.png")).toThrow(
      "supported base64 image data URL",
    );
  });

  it("formats binary byte units", () => {
    expect(formatBytes(1024)).toBe("1.00 KiB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MiB");
  });
});
