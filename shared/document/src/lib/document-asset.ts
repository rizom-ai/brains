import {
  assetRefSchema,
  base64AssetSource,
  computeAssetDigest,
  type AssetSource,
  type StageAssetOptions,
  type StagedAsset,
} from "@brains/entity-service";
import { markdownBody } from "@brains/utils/markdown-frontmatter";
import type {
  DocumentEntity,
  DocumentIngestionStatus,
} from "../schemas/document";
import { parseDocumentDataUrl } from "./document-utils";

/**
 * Largest PDF stored as a new asset, as for images: staging keeps stalls
 * independent of size; this bounds consumers that need whole buffers.
 */
export const DOCUMENT_ASSET_MAX_BYTES: number = 25 * 1024 * 1024;

/**
 * What pending documents stored before they stopped carrying a placeholder:
 * "%PDF-1.4\n% Pending document placeholder\n%%EOF\n", base64-encoded. A
 * pending or failed row holding exactly this has no real bytes. A literal,
 * since this module also loads in the browser, where there is no Buffer.
 */
export const LEGACY_PENDING_DOCUMENT_PLACEHOLDER: string =
  "data:application/pdf;base64,JVBERi0xLjQKJSBQZW5kaW5nIGRvY3VtZW50IHBsYWNlaG9sZGVyCiUlRU9GCg==";

/** What is known beside a document's bytes. */
export interface DocumentDescription {
  filename: string;
  title?: string;
  pageCount?: number;
  status?: DocumentIngestionStatus;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceUploadId?: string;
  sourceFilename?: string;
  sourceMediaType?: string;
  attachmentType?: string;
  dedupKey?: string;
}

/** The staging half of the entity service. */
export interface DocumentAssetStager {
  stageAsset(
    source: AssetSource,
    options?: StageAssetOptions,
  ): Promise<StagedAsset>;
}

export interface StagedDocumentEntity {
  entity: Pick<DocumentEntity, "entityType" | "content" | "metadata">;
  stagedAsset: StagedAsset;
}

/** Every PDF starts with this signature, "%PDF-". */
const PDF_SIGNATURE: readonly number[] = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= PDF_SIGNATURE.length &&
    PDF_SIGNATURE.every((byte, index) => bytes[index] === byte)
  );
}

/**
 * Stage PDF bytes as an asset and describe the document that references
 * them. Bytes that are not a PDF are refused before any are written; publish
 * the result by passing `stagedAsset` with the entity it is saved as.
 */
export async function stageDocumentEntity(
  stager: DocumentAssetStager,
  bytes: Uint8Array,
  description: DocumentDescription,
): Promise<StagedDocumentEntity> {
  if (!isPdfBytes(bytes)) {
    throw new Error("Unsupported document: the bytes are not a PDF");
  }
  const stagedAsset = await stager.stageAsset(bytes, {
    maxBytes: DOCUMENT_ASSET_MAX_BYTES,
  });
  return {
    stagedAsset,
    entity: {
      entityType: "document",
      content: stagedAsset.ref,
      metadata: {
        mimeType: "application/pdf",
        sizeBytes: stagedAsset.sizeBytes,
        ...description,
      },
    },
  };
}

/** A pending or failed document: its facts, and no bytes until its job fills it. */
export function createPendingDocumentEntity(
  description: DocumentDescription,
): Pick<DocumentEntity, "entityType" | "content" | "metadata"> {
  return {
    entityType: "document",
    content: "",
    metadata: { mimeType: "application/pdf", ...description },
  };
}

/** Why an inline document cannot become an asset as it is. */
export type InlineDocumentBlocker =
  "malformed" | "double-encoded" | "unsupported" | "oversized";

/** What migrating one inline document to an asset would store. */
export type InlineDocumentVerdict =
  | { status: "ready"; digest: string; sizeBytes: number }
  | { status: "blocked"; reason: Exclude<InlineDocumentBlocker, "oversized"> }
  | { status: "blocked"; reason: "oversized"; sizeBytes: number };

/** Payloads may be wrapped or padded with whitespace, as files were. */
const INLINE_DATA_URL = /^data:application\/pdf;base64,([\s\S]*)$/i;

/**
 * Decoding a whole data URL as base64 drops its ":", ";" and "," and stores
 * this prefix; the stripped characters cannot be recovered from the row.
 */
const DOUBLE_ENCODED_PAYLOAD = /^dataapplication\/pdfbase64/i;

/** An inline document's base64 payload without whitespace, if it is a PDF data URL. */
export function inlineDocumentPayload(content: string): string | undefined {
  // Non-public rows store a visibility header before the data URL.
  const match = INLINE_DATA_URL.exec(markdownBody(content, { trim: true }));
  return match?.[1]?.replace(/\s/g, "");
}

/**
 * Decode an inline document and say whether it can become an asset. The
 * bytes decide: malformed, non-PDF and oversized payloads are blocked rather
 * than converted.
 */
export function classifyInlineDocument(
  content: string,
  maxBytes: number = DOCUMENT_ASSET_MAX_BYTES,
): InlineDocumentVerdict {
  const payload = inlineDocumentPayload(content);
  if (payload === undefined) return { status: "blocked", reason: "malformed" };
  if (DOUBLE_ENCODED_PAYLOAD.test(payload)) {
    return { status: "blocked", reason: "double-encoded" };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.concat([...base64AssetSource(payload)]);
  } catch {
    return { status: "blocked", reason: "malformed" };
  }
  if (bytes.byteLength === 0) return { status: "blocked", reason: "malformed" };
  if (bytes.byteLength > maxBytes) {
    return {
      status: "blocked",
      reason: "oversized",
      sizeBytes: bytes.byteLength,
    };
  }
  if (!isPdfBytes(bytes)) return { status: "blocked", reason: "unsupported" };
  return {
    status: "ready",
    digest: computeAssetDigest(bytes),
    sizeBytes: bytes.byteLength,
  };
}

/**
 * Check a document's stored content: its asset reference, an inline PDF
 * stored before assets, or nothing while it is pending or failed.
 */
export function assertStoredDocumentContent(content: string): void {
  if (content === "" || assetRefSchema.safeParse(content).success) return;
  parseDocumentDataUrl(content);
}
