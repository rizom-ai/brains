import { baseEntityParserSchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

/**
 * Supported image formats
 */
export const imageFormatSchema: z.ZodEnum<{
  png: "png";
  jpg: "jpg";
  jpeg: "jpeg";
  webp: "webp";
  gif: "gif";
  svg: "svg";
}> = z.enum(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

export type ImageFormat = z.output<typeof imageFormatSchema>;

/**
 * Image entity metadata schema
 * All fields required (auto-detected on upload)
 * sourceUrl is optional - used for deduplication when importing from URLs
 */
export const imageIngestionStatusSchema: z.ZodEnum<{
  pending: "pending";
  draft: "draft";
  failed: "failed";
}> = z.enum(["pending", "draft", "failed"]);

export type ImageIngestionStatus = z.output<typeof imageIngestionStatusSchema>;

type ImageMetadataSchema = z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  alt: z.ZodOptional<z.ZodString>;
  format: typeof imageFormatSchema;
  width: z.ZodNumber;
  height: z.ZodNumber;
  status: z.ZodOptional<typeof imageIngestionStatusSchema>;
  processingJobId: z.ZodOptional<z.ZodString>;
  processingError: z.ZodOptional<z.ZodString>;
  sourceUrl: z.ZodOptional<z.ZodURL>;
  sourceEntityType: z.ZodOptional<z.ZodString>;
  sourceEntityId: z.ZodOptional<z.ZodString>;
  sourceUploadId: z.ZodOptional<z.ZodString>;
  sourceFilename: z.ZodOptional<z.ZodString>;
  sourceMediaType: z.ZodOptional<z.ZodString>;
  attachmentType: z.ZodOptional<z.ZodString>;
  dedupKey: z.ZodOptional<z.ZodString>;
}>;

export const imageMetadataSchema: ImageMetadataSchema = z.object({
  title: z.string().optional(),
  alt: z.string().optional(),
  format: imageFormatSchema,
  width: z.number(),
  height: z.number(),
  status: imageIngestionStatusSchema.optional(),
  processingJobId: z.string().optional(),
  processingError: z.string().optional(),
  sourceUrl: z.url().optional(),
  sourceEntityType: z.string().optional(),
  sourceEntityId: z.string().optional(),
  sourceUploadId: z.string().optional(),
  sourceFilename: z.string().optional(),
  sourceMediaType: z.string().optional(),
  attachmentType: z.string().optional(),
  dedupKey: z.string().optional(),
});

export type ImageMetadata = z.output<typeof imageMetadataSchema>;

/**
 * Image entity schema (extends BaseEntity)
 * Content field contains base64 data URL: data:image/png;base64,...
 */
export const imageSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"image">;
    metadata: ImageMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("image"),
  metadata: imageMetadataSchema,
});

export type Image = z.output<typeof imageSchema>;

/**
 * Resolved image data for templates
 */
export const resolvedImageSchema: z.ZodObject<{
  url: z.ZodString;
  alt: z.ZodString;
  title: z.ZodString;
  width: z.ZodNumber;
  height: z.ZodNumber;
}> = z.object({
  url: z.string(),
  alt: z.string(),
  title: z.string(),
  width: z.number(),
  height: z.number(),
});

export type ResolvedImage = z.output<typeof resolvedImageSchema>;
