import {
  assetRecordSchema,
  createAssetRef,
  MAX_ASSET_BYTES,
  SHA256_DIGEST_PATTERN,
  type AssetRecord,
} from "@brains/assets";
import type { FileInspectionResult } from "@brains/db/file-process-owner";
import { z } from "@brains/utils/zod";
import {
  pdfInspectionDetailsSchema,
  type PdfInspectionDetails,
} from "./file-inspection";

/** Metadata only. Validation establishes consistency, not provenance: publication
 * must still verify the source against these facts through its native owner.
 */
export interface DocumentAssetFacts extends AssetRecord, PdfInspectionDetails {}
export interface DocumentFileLimits {
  maxBytes: number;
  maxPageCount: number;
}
export interface DocumentFileDescriptor {
  sizeBytes: number;
  sha256: string;
  mimeType: string;
}
export const documentAssetFactsSchema: z.ZodType<DocumentAssetFacts> =
  assetRecordSchema
    .safeExtend({
      sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
      mimeType: pdfInspectionDetailsSchema.shape.mimeType,
      pageCount: pdfInspectionDetailsSchema.shape.pageCount,
    })
    .strict();
export const documentFileLimitsSchema: z.ZodType<DocumentFileLimits> =
  z.strictObject({
    maxBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
    maxPageCount: z.number().int().positive(),
  });
const descriptorSchema: z.ZodType<DocumentFileDescriptor> = z.strictObject({
  sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
  sha256: z.string().regex(SHA256_DIGEST_PATTERN),
  mimeType: z.string().min(1).max(128),
});

/** Convert an owned PDF inspection receipt without reading, copying or hashing
 * any payload. Callers select the explicitly provisioned `pdf` inspector.
 * Zero pages remains unknown; never substitute a producer's declared count here.
 */
export function documentAssetFactsFromInspection(
  inspection: FileInspectionResult,
  limits: DocumentFileLimits,
): DocumentAssetFacts {
  const bounded = documentFileLimitsSchema.parse(limits);
  const details = pdfInspectionDetailsSchema.parse(inspection.details);
  const facts = documentAssetFactsSchema.parse({
    ref: createAssetRef(inspection.sha256),
    digest: inspection.sha256,
    sizeBytes: inspection.sizeBytes,
    ...details,
  });
  if (facts.sizeBytes > bounded.maxBytes)
    throw new Error(
      `Rendered PDF exceeds maxBytes=${bounded.maxBytes}: ${facts.sizeBytes} bytes`,
    );
  if (facts.pageCount > bounded.maxPageCount)
    throw new Error(
      `Rendered PDF has ${facts.pageCount} pages, exceeding maxPageCount=${bounded.maxPageCount}`,
    );
  return facts;
}

/** Rendered descriptors are claims, not inspection receipts. Check all three
 * fields before publication or an external send; uploads without such a
 * descriptor still require independent native inspection and publication.
 */
export function assertDocumentFileMatches(
  facts: DocumentAssetFacts,
  descriptor: DocumentFileDescriptor,
): void {
  const inspected = documentAssetFactsSchema.parse(facts);
  const declared = descriptorSchema.parse(descriptor);
  if (
    inspected.sizeBytes !== declared.sizeBytes ||
    inspected.digest !== declared.sha256 ||
    inspected.mimeType !== declared.mimeType
  )
    throw new Error(
      "Rendered document file does not match its attachment metadata",
    );
}
