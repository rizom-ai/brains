import { describe, expect, it } from "bun:test";
import { documentEntity } from "../src";

describe("document instructions", () => {
  it("routes PDF artifacts through the current tool arguments", async () => {
    const instructions = documentEntity().instructions ?? "";

    expect(instructions).toContain("system_generate operation.kind attachment");
    expect(instructions).toContain("upload transform preserve");
    expect(instructions).not.toContain("source.kind attachment");
  });

  // Told only to preserve uploaded PDFs, a model asked for a note from one
  // generated a note instead of extracting the PDF's text.
  it("imports an uploaded PDF's text when asked for a note", () => {
    expect(documentEntity().instructions ?? "").toContain(
      "asked to turn one into a note, import its text with system_create upload transform extract-markdown",
    );
  });
});
