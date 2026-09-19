import { z } from "@brains/utils/zod";
import { MAX_ASSET_BYTES } from "@brains/assets";
import { MAX_PDF_BYTES, readRenderMetadata } from "./render-request";

export const PREVIEW_PDF_REQUEST_FILE = "preview.json";
export const PREVIEW_PDF_METADATA_BYTES = 8192;
export interface PreviewPdfInput {
  url: string;
  maxBytes?: number | undefined;
  timeoutMs?: number | undefined;
  width?: string | number | undefined;
  height?: string | number | undefined;
  format?: string | undefined;
}
export interface PreviewPdfRequest extends PreviewPdfInput {
  maxBytes: number;
  timeoutMs: number;
}
const dimensionSchema = z.union([z.string().max(64), z.number().finite()]);
export const previewPdfRequestSchema: z.ZodType<PreviewPdfRequest> =
  z.strictObject({
    url: z
      .string()
      .min(1)
      .max(4096)
      .url()
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
    maxBytes: z
      .number()
      .int()
      .positive()
      .max(MAX_ASSET_BYTES)
      .default(MAX_PDF_BYTES),
    timeoutMs: z.number().int().positive().default(60_000),
    width: dimensionSchema.optional(),
    height: dimensionSchema.optional(),
    format: z.string().max(64).optional(),
  });
export function readPreviewPdfRequest(
  directory: string,
): Promise<PreviewPdfRequest> {
  return readRenderMetadata(
    directory,
    PREVIEW_PDF_REQUEST_FILE,
    PREVIEW_PDF_METADATA_BYTES,
    previewPdfRequestSchema,
  );
}
