import { describe, expect, it, mock } from "bun:test";
import { computeAssetDigest, createAssetRef } from "@brains/entity-service";
import { createMockAssetStore } from "@brains/entity-service/test";
import {
  DOCUMENT_ASSET_MAX_BYTES,
  LEGACY_PENDING_DOCUMENT_PLACEHOLDER,
  classifyInlineDocument,
  createPdfDataUrl,
  createPendingDocumentEntity,
  documentSchema,
  inlineDocumentPayload,
  stageDocumentEntity,
} from "../src";

const PDF = Buffer.from(
  "%PDF-1.7\n1 0 obj << /Type /Pages /Count 2 >>\n%%EOF\n",
);

describe("stageDocumentEntity", () => {
  it("stages PDF bytes and stores their reference with the facts beside them", async () => {
    const store = createMockAssetStore();
    const stageAsset = mock(store.stageAsset);

    const { entity, stagedAsset } = await stageDocumentEntity(
      { stageAsset },
      PDF,
      {
        filename: "carousel.pdf",
        title: "Carousel",
        pageCount: 2,
        status: "draft",
        attachmentType: "carousel",
      },
    );

    expect(stagedAsset.ref).toBe(createAssetRef(computeAssetDigest(PDF)));
    expect(stageAsset.mock.calls[0]?.[1]).toEqual({
      maxBytes: DOCUMENT_ASSET_MAX_BYTES,
    });
    expect(entity).toEqual({
      entityType: "document",
      content: stagedAsset.ref,
      metadata: {
        mimeType: "application/pdf",
        sizeBytes: PDF.byteLength,
        filename: "carousel.pdf",
        title: "Carousel",
        pageCount: 2,
        status: "draft",
        attachmentType: "carousel",
      },
    });
  });

  it("refuses bytes that are not a PDF before staging any", async () => {
    const stageAsset = mock(createMockAssetStore().stageAsset);

    expect(
      stageDocumentEntity({ stageAsset }, Buffer.from("hello"), {
        filename: "notes.pdf",
      }),
    ).rejects.toThrow("not a PDF");
    expect(stageAsset).not.toHaveBeenCalled();
  });
});

describe("a pending document", () => {
  it("holds no bytes until its job fills it", () => {
    const pending = createPendingDocumentEntity({
      filename: "carousel.pdf",
      status: "pending",
    });

    expect(pending.content).toBe("");
    expect(pending.metadata).toEqual({
      mimeType: "application/pdf",
      filename: "carousel.pdf",
      status: "pending",
    });
  });
});

describe("the stored forms a document parses from", () => {
  const record = {
    id: "doc-1",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    contentHash: "hash",
    entityType: "document",
    metadata: { mimeType: "application/pdf", filename: "doc.pdf" },
  };

  it("accepts an asset reference, an inline PDF and an empty pending record", () => {
    for (const content of [
      createAssetRef(computeAssetDigest(PDF)),
      createPdfDataUrl(PDF),
      "",
    ]) {
      expect(documentSchema.safeParse({ ...record, content }).success).toBe(
        true,
      );
    }
    expect(
      documentSchema.safeParse({ ...record, content: "plain text" }).success,
    ).toBe(false);
  });
});

describe("classifyInlineDocument", () => {
  it("is ready to migrate a PDF data URL, wrapped or not", () => {
    const base64 = PDF.toString("base64");
    const wrapped = `data:application/pdf;base64,${base64.slice(0, 10)}\n${base64.slice(10)}\n`;

    expect(classifyInlineDocument(createPdfDataUrl(PDF))).toEqual({
      status: "ready",
      digest: computeAssetDigest(PDF),
      sizeBytes: PDF.byteLength,
    });
    expect(classifyInlineDocument(wrapped)).toMatchObject({ status: "ready" });
    expect(inlineDocumentPayload(wrapped)).toBe(base64);
  });

  it("blocks what cannot become a PDF asset as it is", () => {
    expect(classifyInlineDocument("not a data url")).toEqual({
      status: "blocked",
      reason: "malformed",
    });
    expect(
      classifyInlineDocument(
        `data:application/pdf;base64,${Buffer.from("hello").toString("base64")}`,
      ),
    ).toEqual({ status: "blocked", reason: "unsupported" });
    expect(
      classifyInlineDocument(
        `data:application/pdf;base64,${createPdfDataUrl(PDF).replace(/[:;,]/g, "")}`,
      ),
    ).toEqual({ status: "blocked", reason: "double-encoded" });
    expect(classifyInlineDocument(createPdfDataUrl(PDF), 4)).toEqual({
      status: "blocked",
      reason: "oversized",
      sizeBytes: PDF.byteLength,
    });
  });

  it("names the placeholder pending documents held before they stopped carrying one", () => {
    expect(LEGACY_PENDING_DOCUMENT_PLACEHOLDER).toBe(
      `data:application/pdf;base64,${Buffer.from(
        "%PDF-1.4\n% Pending document placeholder\n%%EOF\n",
      ).toString("base64")}`,
    );
  });
});
