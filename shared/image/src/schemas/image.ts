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
  format: z.ZodOptional<typeof imageFormatSchema>;
  mediaType: z.ZodOptional<z.ZodString>;
  sizeBytes: z.ZodOptional<z.ZodNumber>;
  width: z.ZodOptional<z.ZodNumber>;
  height: z.ZodOptional<z.ZodNumber>;
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

/**
 * A pending or failed image has no bytes yet, so it carries no format or
 * dimensions; every other image is described by its bytes.
 */
export const imageMetadataSchema: ImageMetadataSchema = z
  .object({
    title: z.string().optional(),
    alt: z.string().optional(),
    format: imageFormatSchema.optional(),
    /** Set for asset-backed images; the type the bytes are served as. */
    mediaType: z.string().optional(),
    /** Set for asset-backed images; the stored byte count. */
    sizeBytes: z.number().int().nonnegative().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
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
  })
  .superRefine((metadata, ctx) => {
    if (metadata.status === "pending" || metadata.status === "failed") return;
    for (const field of ["format", "width", "height"] as const) {
      if (metadata[field] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `A completed image needs its ${field}`,
        });
      }
    }
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
