import { baseEntityParserSchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

export const documentMimeTypeSchema: z.ZodLiteral<"application/pdf"> =
  z.literal("application/pdf");

export type DocumentMimeType = z.output<typeof documentMimeTypeSchema>;

export const documentIngestionStatusSchema: z.ZodEnum<{
  pending: "pending";
  draft: "draft";
  failed: "failed";
}> = z.enum(["pending", "draft", "failed"]);

export type DocumentIngestionStatus = z.output<
  typeof documentIngestionStatusSchema
>;

type DocumentMetadataSchema = z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  mimeType: typeof documentMimeTypeSchema;
  filename: z.ZodString;
  pageCount: z.ZodOptional<z.ZodNumber>;
  status: z.ZodOptional<typeof documentIngestionStatusSchema>;
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

// A person titles a document; the rest records the file.
export const documentMetadataSchema: DocumentMetadataSchema = z.object({
  title: z.string().optional(),
  mimeType: documentMimeTypeSchema.meta({ studioWidget: "provenance" }),
  filename: z.string().min(1).meta({ studioWidget: "provenance" }),
  pageCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .meta({ studioWidget: "provenance" }),
  status: documentIngestionStatusSchema
    .optional()
    .meta({ studioWidget: "provenance" }),
  processingJobId: z.string().optional().meta({ studioWidget: "hidden" }),
  processingError: z.string().optional().meta({ studioWidget: "provenance" }),
  sourceEntityType: z
    .string()
    .min(1)
    .optional()
    .meta({ studioWidget: "provenance" }),
  sourceEntityId: z
    .string()
    .min(1)
    .optional()
    .meta({ studioWidget: "provenance" }),
  sourceUploadId: z.string().optional().meta({ studioWidget: "provenance" }),
  sourceFilename: z.string().optional().meta({ studioWidget: "provenance" }),
  sourceMediaType: z.string().optional().meta({ studioWidget: "provenance" }),
  attachmentType: z
    .string()
    .min(1)
    .optional()
    .meta({ studioWidget: "provenance" }),
  dedupKey: z.string().min(1).optional().meta({ studioWidget: "hidden" }),
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
