import { describe, expect, it } from "bun:test";
import { chatAttachmentFromUpload } from "../../src/message-interface/upload-policy";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const source = { kind: "upload", id: "upload-1" };

describe("an upload as a chat attachment", () => {
  it("is text for a file the upload policy reads as text, its BOM dropped", () => {
    expect(
      chatAttachmentFromUpload({
        filename: "notes.md",
        mediaType: "text/markdown",
        content: bytes("﻿# Notes"),
        source,
      }),
    ).toEqual({
      kind: "text",
      filename: "notes.md",
      mediaType: "text/markdown",
      content: "# Notes",
      sizeBytes: 10,
      source,
    });
  });

  it("is a file for anything else, even a text media type the policy does not read", () => {
    const attachment = chatAttachmentFromUpload({
      filename: "page.html",
      mediaType: "text/html",
      content: bytes("<p>Hi</p>"),
      source,
    });
    expect(attachment.kind).toBe("file");
  });

  it("is a file for an image, keeping its bytes", () => {
    const content = new Uint8Array([137, 80, 78, 71]);
    const attachment = chatAttachmentFromUpload({
      filename: "photo.png",
      mediaType: "image/png",
      content,
    });
    expect(attachment).toEqual({
      kind: "file",
      filename: "photo.png",
      mediaType: "image/png",
      data: content,
      sizeBytes: 4,
    });
  });

  it("keeps text an upload's validation already read", () => {
    const attachment = chatAttachmentFromUpload({
      filename: "notes.txt",
      mediaType: "text/plain",
      content: bytes("raw"),
      text: "validated",
      sizeBytes: 3,
    });
    expect(attachment).toMatchObject({ kind: "text", content: "validated" });
  });
});
