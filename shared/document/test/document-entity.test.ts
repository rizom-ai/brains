import { describe, expect, it } from "bun:test";
import {
  createDocumentEntity,
  createPdfDataUrl,
  documentSchema,
  parseDocumentDataUrl,
} from "../src";

const pdfDataUrl = createPdfDataUrl(Buffer.from("%PDF-1.7\n%test"));

describe("document entity data", () => {
  it("creates a document entity from a PDF data URL", () => {
    const entity = createDocumentEntity({
      dataUrl: pdfDataUrl,
      filename: "carousel.pdf",
      title: "Carousel",
      pageCount: 5,
      sourceEntityType: "social-post",
      sourceEntityId: "post-1",
      attachmentType: "carousel",
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
    expect(parsed.metadata.attachmentType).toBe("carousel");
    expect(parsed.metadata.dedupKey).toBe("social-carousel:post-1:hash");
  });

  it("rejects non-PDF data URLs", () => {
    expect(() =>
      parseDocumentDataUrl("data:text/plain;base64,aGVsbG8="),
    ).toThrow("Invalid PDF document data URL");
  });
});
