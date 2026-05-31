import { describe, expect, it } from "bun:test";
import {
  defaultWebChatUploadFilename,
  normalizeTextUploadMediaType,
  sanitizeUploadFilename,
  validateTextUpload,
  webChatTextUploadAccept,
  webChatTextUploadMaxBytes,
} from "../src/upload-policy";

describe("web chat upload policy", () => {
  it("documents the accepted browser file types and max text upload size", () => {
    expect(webChatTextUploadAccept).toBe(
      ".md,.txt,.markdown,text/plain,text/markdown,text/x-markdown",
    );
    expect(webChatTextUploadMaxBytes).toBe(100_000);
  });

  it("sanitizes uploaded filenames to a safe leaf name", () => {
    expect(sanitizeUploadFilename("../notes.md")).toBe("notes.md");
    expect(sanitizeUploadFilename("folder\\notes.txt")).toBe("notes.txt");
    expect(sanitizeUploadFilename("\u0000\u007f")).toBe(
      defaultWebChatUploadFilename,
    );
  });

  it("normalizes missing text media types from supported filename extensions", () => {
    expect(normalizeTextUploadMediaType("notes.md", "")).toBe("text/markdown");
    expect(normalizeTextUploadMediaType("notes.markdown", "")).toBe(
      "text/markdown",
    );
    expect(normalizeTextUploadMediaType("notes.txt", "")).toBe("text/plain");
    expect(normalizeTextUploadMediaType("notes.bin", "")).toBe(
      "application/octet-stream",
    );
  });

  it("accepts UTF-8 text uploads and returns normalized metadata", () => {
    expect(
      validateTextUpload({
        filename: "../notes.md",
        mediaType: "",
        content: Buffer.from("# Notes"),
      }),
    ).toEqual({
      ok: true,
      filename: "notes.md",
      mediaType: "text/markdown",
      sizeBytes: 7,
      text: "# Notes",
    });
  });

  it("rejects unsupported media policies before storing content", () => {
    expect(
      validateTextUpload({
        filename: "image.png",
        mediaType: "image/png",
        content: Buffer.from("not image"),
      }),
    ).toEqual({
      ok: false,
      code: "unsupported_type",
      message: "Unsupported file upload type: image.png",
    });
  });

  it("rejects oversized text uploads", () => {
    expect(
      validateTextUpload({
        filename: "large.txt",
        mediaType: "text/plain",
        content: Buffer.from("x".repeat(webChatTextUploadMaxBytes + 1)),
      }),
    ).toEqual({
      ok: false,
      code: "file_too_large",
      message: "File upload too large: large.txt",
    });
  });

  it("rejects binary payloads even when the filename and media type are text", () => {
    expect(
      validateTextUpload({
        filename: "notes.txt",
        mediaType: "text/plain",
        content: Buffer.from(new Uint8Array([0x68, 0x69, 0x00, 0xff])),
      }),
    ).toEqual({
      ok: false,
      code: "binary_content",
      message: "Unsupported file upload type: notes.txt",
    });
  });
});
