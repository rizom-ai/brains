import { describe, expect, it } from "bun:test";
import { parseBase64DataUrl } from "../src/data-url";

describe("parseBase64DataUrl", () => {
  it("reads the media type and the bytes", () => {
    const parsed = parseBase64DataUrl("data:image/png;base64,aGVsbG8=");
    expect(parsed?.mimeType).toBe("image/png");
    expect(parsed?.data.toString("utf8")).toBe("hello");
  });

  it("reads past the newline a markdown file leaves behind", () => {
    expect(
      parseBase64DataUrl("data:application/pdf;base64,aGVsbG8=\n")?.mimeType,
    ).toBe("application/pdf");
  });

  it("reads nothing from what is not a base64 data URL", () => {
    expect(parseBase64DataUrl("https://example.com/a.png")).toBeUndefined();
    expect(parseBase64DataUrl("data:text/plain,hello")).toBeUndefined();
    expect(parseBase64DataUrl("data:image/png;base64,")).toBeUndefined();
  });
});
