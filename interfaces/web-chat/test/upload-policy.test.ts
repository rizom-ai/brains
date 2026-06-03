import { describe, expect, it } from "bun:test";
import {
  defaultWebChatUploadFilename,
  normalizeTextUploadMediaType,
  sanitizeUploadFilename,
  validateTextUpload,
  validateWebChatUpload,
  webChatTextUploadAccept,
  webChatTextUploadMaxBytes,
  webChatUploadAccept,
  webChatUploadMaxBytes,
} from "../src/upload-policy";

describe("web chat upload policy", () => {
  it("documents the accepted browser file types and max upload sizes", () => {
    expect(webChatTextUploadAccept).toBe(
      ".md,.txt,.markdown,text/plain,text/markdown,text/x-markdown",
    );
    expect(webChatUploadAccept).toBe(
      ".md,.txt,.markdown,.png,.jpg,.jpeg,.webp,.gif,.pdf,text/plain,text/markdown,text/x-markdown,image/png,image/jpeg,image/webp,image/gif,application/pdf",
    );
    expect(webChatTextUploadMaxBytes).toBe(100_000);
    expect(webChatUploadMaxBytes).toBe(5_000_000);
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

  it("rejects unsupported media policies before storing text content", () => {
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

  it("accepts supported image uploads as native file attachments", () => {
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    expect(
      validateWebChatUpload({
        filename: "../robot.png",
        mediaType: "image/png",
        content: pngBytes,
      }),
    ).toEqual({
      ok: true,
      kind: "file",
      filename: "robot.png",
      mediaType: "image/png",
      sizeBytes: pngBytes.byteLength,
    });
  });

  it("infers supported image media types from filenames for generic browser uploads", () => {
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    expect(
      validateWebChatUpload({
        filename: "robot.png",
        mediaType: "application/octet-stream",
        content: pngBytes,
      }),
    ).toEqual({
      ok: true,
      kind: "file",
      filename: "robot.png",
      mediaType: "image/png",
      sizeBytes: pngBytes.byteLength,
    });
  });

  it("rejects spoofed binary uploads with unsupported content", () => {
    expect(
      validateWebChatUpload({
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
