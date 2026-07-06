import { baseEntityParserSchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

/**
 * Supported image formats
 */
export type ImageFormat = "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg";

export const imageFormatSchema: z.ZodType<ImageFormat> = z.enum([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
]);

/**
 * Image entity metadata schema
 * All fields required (auto-detected on upload)
 * sourceUrl is optional - used for deduplication when importing from URLs
 */
export type ImageIngestionStatus = "pending" | "draft" | "failed";

export const imageIngestionStatusSchema: z.ZodType<ImageIngestionStatus> =
  z.enum(["pending", "draft", "failed"]);

type ImageMetadataSchema = z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  alt: z.ZodOptional<z.ZodString>;
  format: z.ZodType<ImageFormat>;
  width: z.ZodNumber;
  height: z.ZodNumber;
  status: z.ZodOptional<z.ZodType<ImageIngestionStatus>>;
  processingJobId: z.ZodOptional<z.ZodString>;
  processingError: z.ZodOptional<z.ZodString>;
  sourceUrl: z.ZodOptional<z.ZodType<string>>;
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
export interface ResolvedImage {
  url: string;
  alt: string;
  title: string;
  width: number;
  height: number;
}

export const resolvedImageSchema: z.ZodType<ResolvedImage> = z.object({
  url: z.string(),
  alt: z.string(),
  title: z.string(),
  width: z.number(),
  height: z.number(),
});
