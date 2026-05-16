import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

export const documentMimeTypeSchema = z.literal("application/pdf");
export type DocumentMimeType = z.infer<typeof documentMimeTypeSchema>;

export const documentMetadataSchema = z.object({
  title: z.string().optional(),
  mimeType: documentMimeTypeSchema,
  filename: z.string().min(1),
  pageCount: z.number().int().min(0).optional(),
  sourceEntityType: z.string().min(1).optional(),
  sourceEntityId: z.string().min(1).optional(),
  sourceTemplate: z.string().min(1).optional(),
  dedupKey: z.string().min(1).optional(),
});

export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;

export const documentSchema = baseEntitySchema.extend({
  entityType: z.literal("document"),
  content: z.string().regex(/^data:application\/pdf;base64,.+$/),
  metadata: documentMetadataSchema,
});

export type DocumentEntity = z.infer<typeof documentSchema>;
