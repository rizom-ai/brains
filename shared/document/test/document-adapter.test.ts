import { describe, expect, it } from "bun:test";
import {
  createPdfDataUrl,
  documentAdapter,
  documentSchema,
  parseDocumentDataUrl,
} from "../src";

const pdfDataUrl = createPdfDataUrl(Buffer.from("%PDF-1.7\n%test"));

describe("document adapter", () => {
  it("creates a document entity from a PDF data URL", () => {
    const entity = documentAdapter.createDocumentEntity({
      dataUrl: pdfDataUrl,
      filename: "carousel.pdf",
      title: "Carousel",
      pageCount: 5,
      sourceEntityType: "social-post",
      sourceEntityId: "post-1",
      sourceTemplate: "social-carousel",
      dedupKey: "social-carousel:post-1:hash",
    });

    const parsed = documentSchema.parse({
      id: "doc-1",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      contentHash: "hash",
      ...entity,
    });

    expect(parsed.entityType).toBe("document");
    expect(parsed.metadata.mimeType).toBe("application/pdf");
    expect(parsed.metadata.filename).toBe("carousel.pdf");
    expect(parsed.metadata.pageCount).toBe(5);
    expect(parsed.metadata.dedupKey).toBe("social-carousel:post-1:hash");
  });

  it("validates raw PDF content and leaves metadata to the import pipeline", () => {
    const partial = documentAdapter.fromMarkdown(pdfDataUrl);

    expect(partial.entityType).toBe("document");
    expect(partial.content).toBe(pdfDataUrl);
    // metadata is intentionally absent: filename/mimeType/dedupKey/source
    // provenance come from the directory-sync sidecar, not from the bytes.
    expect(partial.metadata).toBeUndefined();
  });

  it("rejects non-PDF content via fromMarkdown", () => {
    expect(() =>
      documentAdapter.fromMarkdown("data:text/plain;base64,aGVsbG8="),
    ).toThrow("Invalid PDF document data URL");
  });

  it("rejects non-PDF data URLs", () => {
    expect(() =>
      parseDocumentDataUrl("data:text/plain;base64,aGVsbG8="),
    ).toThrow("Invalid PDF document data URL");
  });
});
