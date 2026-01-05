import { z } from "zod";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Supported image formats
 */
export const imageFormatSchema = z.enum([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
]);
export type ImageFormat = z.infer<typeof imageFormatSchema>;

/**
 * Image entity metadata schema
 * All fields required (auto-detected on upload)
 */
export const imageMetadataSchema = z.object({
  title: z.string(),
  alt: z.string(),
  format: imageFormatSchema,
  width: z.number(),
  height: z.number(),
});

export type ImageMetadata = z.infer<typeof imageMetadataSchema>;

/**
 * Image entity schema (extends BaseEntity)
 * Content field contains base64 data URL: data:image/png;base64,...
 */
export const imageSchema = baseEntitySchema.extend({
  entityType: z.literal("image"),
  metadata: imageMetadataSchema,
});

export type Image = z.infer<typeof imageSchema>;

/**
 * Resolved image data for templates
 */
export const resolvedImageSchema = z.object({
  url: z.string(),
  alt: z.string(),
  title: z.string(),
  width: z.number(),
  height: z.number(),
});

export type ResolvedImage = z.infer<typeof resolvedImageSchema>;
