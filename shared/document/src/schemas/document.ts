import { baseEntityParserSchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod-v4";

export const documentMimeTypeSchema = z.literal("application/pdf");
export type DocumentMimeType = z.output<typeof documentMimeTypeSchema>;

export const documentIngestionStatusSchema = z.enum([
  "pending",
  "draft",
  "failed",
]);
export type DocumentIngestionStatus = z.output<
  typeof documentIngestionStatusSchema
>;

export const documentMetadataSchema = z.object({
  title: z.string().optional(),
  mimeType: documentMimeTypeSchema,
  filename: z.string().min(1),
  pageCount: z.number().int().min(0).optional(),
  status: documentIngestionStatusSchema.optional(),
  processingJobId: z.string().optional(),
  processingError: z.string().optional(),
  sourceEntityType: z.string().min(1).optional(),
  sourceEntityId: z.string().min(1).optional(),
  sourceUploadId: z.string().optional(),
  sourceFilename: z.string().optional(),
  sourceMediaType: z.string().optional(),
  attachmentType: z.string().min(1).optional(),
  dedupKey: z.string().min(1).optional(),
});

export type DocumentMetadata = z.output<typeof documentMetadataSchema>;

export const documentSchema = baseEntityParserSchema.extend({
  entityType: z.literal("document"),
  content: z.string().regex(/^data:application\/pdf;base64,.+$/),
  metadata: documentMetadataSchema,
});

export type DocumentEntity = z.output<typeof documentSchema>;
