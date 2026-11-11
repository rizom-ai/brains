import { describe, expect, it } from "bun:test";
import { fileBytes } from "../src/file-bytes";

describe("a file part's bytes", () => {
  it("are read from base64 text and from raw bytes", () => {
    expect(fileBytes("aGVsbG8=")?.toString()).toBe("hello");
    expect(fileBytes(new Uint8Array([104, 105]))?.toString()).toBe("hi");
  });

  it("are read from data and text the part holds", () => {
    expect(
      fileBytes({ type: "data", data: new Uint8Array([104, 105]) })?.toString(),
    ).toBe("hi");
    expect(fileBytes({ type: "data", data: "aGVsbG8=" })?.toString()).toBe(
      "hello",
    );
    expect(fileBytes({ type: "text", text: "notes" })?.toString()).toBe(
      "notes",
    );
  });

  it("are none for a part that only points at a file", () => {
    expect(fileBytes(new URL("https://example.com/a.pdf"))).toBeUndefined();
    expect(
      fileBytes({ type: "url", url: new URL("https://example.com/a.pdf") }),
    ).toBeUndefined();
  });
});
