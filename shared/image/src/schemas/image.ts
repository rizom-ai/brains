import { assetRefSchema } from "@brains/assets";
import { baseEntityParserSchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

/** Canonical durable raster formats. JPEG metadata is normalized to `jpeg`. */
export type ImageFormat = "png" | "jpeg" | "webp" | "gif";
export type ImageMediaType =
  "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export const imageFormatSchema: z.ZodType<ImageFormat, unknown> = z
  .enum(["png", "jpg", "jpeg", "webp", "gif"])
  .transform((format): ImageFormat => (format === "jpg" ? "jpeg" : format));

export const imageMediaTypeSchema: z.ZodType<ImageMediaType> = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export type ImageIngestionStatus = "pending" | "draft" | "failed";

export const imageIngestionStatusSchema: z.ZodType<ImageIngestionStatus> =
  z.enum(["pending", "draft", "failed"]);

type ImageMetadataSchema = z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  alt: z.ZodOptional<z.ZodString>;
  format: z.ZodOptional<z.ZodType<ImageFormat, unknown>>;
  mediaType: z.ZodOptional<z.ZodType<ImageMediaType>>;
  sizeBytes: z.ZodOptional<z.ZodNumber>;
  width: z.ZodOptional<z.ZodNumber>;
  height: z.ZodOptional<z.ZodNumber>;
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
  format: imageFormatSchema.optional(),
  mediaType: imageMediaTypeSchema.optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
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

const supportedLegacyImageDataUrlPattern =
  /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i;

/**
 * Transitional image schema. Existing raster data URLs remain readable during
 * the cutover, while every newly completed image is stored as an asset ref.
 */
export interface Image extends Omit<
  z.output<typeof baseEntityParserSchema>,
  "entityType" | "metadata"
> {
  entityType: "image";
  metadata: ImageMetadata;
}

export const imageSchema: z.ZodType<Image, unknown> = baseEntityParserSchema
  .extend({
    entityType: z.literal("image"),
    content: z.string(),
    metadata: imageMetadataSchema,
  })
  .superRefine((image, context) => {
    const content = image.content.trim();
    const isAsset = assetRefSchema.safeParse(content).success;
    const isLegacyDataUrl = supportedLegacyImageDataUrlPattern.test(content);
    const isIncomplete =
      image.metadata.status === "pending" || image.metadata.status === "failed";

    if (!content) {
      if (!isIncomplete) {
        context.addIssue({
          code: "custom",
          path: ["content"],
          message: "Only pending or failed images may have empty content",
        });
      }
      return;
    }

    if (!isAsset && !isLegacyDataUrl) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message:
          "Image content must be a supported raster data URL or SHA-256 asset reference",
      });
      return;
    }

    // Legacy rows predate mediaType/sizeBytes, so require the complete binary
    // fact set only once content has crossed to the asset representation.
    if (isAsset) {
      const requiredFacts: Array<keyof ImageMetadata> = [
        "format",
        "mediaType",
        "sizeBytes",
        "width",
        "height",
      ];
      for (const fact of requiredFacts) {
        if (image.metadata[fact] === undefined) {
          context.addIssue({
            code: "custom",
            path: ["metadata", fact],
            message: `Asset-backed images require ${fact}`,
          });
        }
      }
    }
  });
