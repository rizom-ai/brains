import { describe, expect, it } from "bun:test";
import { createAssetRef } from "@brains/assets";
import {
  documentAdapter,
  documentSchema,
  type DocumentAssetFacts,
} from "../src";
const facts: DocumentAssetFacts = {
  ref: createAssetRef("a".repeat(64)),
  digest: "a".repeat(64),
  sizeBytes: 512,
  mimeType: "application/pdf",
  pageCount: 5,
};
const identity = {
  id: "doc-1",
  created: "2026-05-30T00:00:00.000Z",
  updated: "2026-05-30T00:00:00.000Z",
  contentHash: "hash",
};

describe("document adapter", () => {
  it("stores an asset reference and inspected facts with complete provenance", () => {
    const entity = documentAdapter.createDocumentEntity({
      facts,
      filename: "carousel.pdf",
      title: "Carousel",
      sourceEntityType: "social-post",
      sourceEntityId: "post-1",
      attachmentType: "carousel",
      dedupKey: "social-carousel:post-1:hash",
    });
    const parsed = documentSchema.parse({ ...identity, ...entity });
    expect(parsed.content).toBe(facts.ref);
    expect(parsed.metadata).toMatchObject({
      mimeType: "application/pdf",
      filename: "carousel.pdf",
      pageCount: 5,
      sizeBytes: 512,
      attachmentType: "carousel",
      dedupKey: "social-carousel:post-1:hash",
      status: "draft",
    });
  });
  it("round trips a reference while leaving imported metadata to the sidecar", () => {
    const partial = documentAdapter.fromMarkdown(facts.ref);
    expect(partial).toEqual({ entityType: "document", content: facts.ref });
    const entity = documentSchema.parse({
      ...identity,
      ...documentAdapter.createDocumentEntity({ facts, filename: "file.pdf" }),
    });
    expect(documentAdapter.toMarkdown(entity)).toBe(facts.ref);
  });
  it("uses empty pending/failed content, not a fake inline PDF", () => {
    for (const status of ["pending", "failed"] as const) {
      const pending = documentAdapter.createPendingDocumentEntity({
        filename: "pending.pdf",
        status,
      });
      expect(documentSchema.parse({ ...identity, ...pending }).content).toBe(
        "",
      );
    }
    expect(documentAdapter.fromMarkdown("").content).toBe("");
    expect(
      documentSchema.safeParse({
        ...identity,
        ...documentAdapter.createPendingDocumentEntity({
          filename: "pending.pdf",
        }),
        metadata: {
          filename: "pending.pdf",
          mimeType: "application/pdf",
          status: "draft",
        },
      }).success,
    ).toBe(false);
  });
  it("rejects inline PDFs rather than retaining a compatibility reader", () => {
    const inline = "data:application/pdf;base64,JVBERi0xLjc=";
    expect(() => documentAdapter.fromMarkdown(inline)).toThrow();
    expect(
      documentSchema.safeParse({
        ...identity,
        ...documentAdapter.createDocumentEntity({
          facts,
          filename: "file.pdf",
        }),
        content: inline,
      }).success,
    ).toBe(false);
  });
  it("requires measured binary facts, with zero pages meaning unknown", () => {
    const entity = documentAdapter.createDocumentEntity({
      facts: { ...facts, pageCount: 0 },
      filename: "file.pdf",
    });
    expect(
      documentSchema.parse({ ...identity, ...entity }).metadata.pageCount,
    ).toBe(0);
    expect(
      documentSchema.safeParse({
        ...identity,
        ...entity,
        metadata: { mimeType: "application/pdf", filename: "file.pdf" },
      }).success,
    ).toBe(false);
  });
});
