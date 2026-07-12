import { baseEntityParserSchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

export type DocumentMimeType = "application/pdf";

export const documentMimeTypeSchema: z.ZodType<DocumentMimeType> =
  z.literal("application/pdf");

export type DocumentIngestionStatus = "pending" | "draft" | "failed";

export const documentIngestionStatusSchema: z.ZodType<DocumentIngestionStatus> =
  z.enum(["pending", "draft", "failed"]);

type DocumentMetadataSchema = z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  mimeType: z.ZodType<DocumentMimeType>;
  filename: z.ZodString;
  pageCount: z.ZodOptional<z.ZodNumber>;
  status: z.ZodOptional<z.ZodType<DocumentIngestionStatus>>;
  processingJobId: z.ZodOptional<z.ZodString>;
  processingError: z.ZodOptional<z.ZodString>;
  sourceEntityType: z.ZodOptional<z.ZodString>;
  sourceEntityId: z.ZodOptional<z.ZodString>;
  sourceUploadId: z.ZodOptional<z.ZodString>;
  sourceFilename: z.ZodOptional<z.ZodString>;
  sourceMediaType: z.ZodOptional<z.ZodString>;
  attachmentType: z.ZodOptional<z.ZodString>;
  dedupKey: z.ZodOptional<z.ZodString>;
}>;

export const documentMetadataSchema: DocumentMetadataSchema = z.object({
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

export const documentSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"document">;
    content: z.ZodString;
    metadata: DocumentMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("document"),
  content: z.string().regex(/^data:application\/pdf;base64,.+$/),
  metadata: documentMetadataSchema,
});

export type DocumentEntity = z.output<typeof documentSchema>;
