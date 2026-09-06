import { assetRefSchema } from "@brains/assets";
import { baseEntityParserSchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

/** Canonical durable raster formats. JPEG metadata is normalized to `jpeg`. */
const canonicalImageFormatSchema: z.ZodEnum<{
  png: "png";
  jpeg: "jpeg";
  webp: "webp";
  gif: "gif";
}> = z.enum(["png", "jpeg", "webp", "gif"]);

export type ImageFormat = z.output<typeof canonicalImageFormatSchema>;

export const imageFormatSchema: z.ZodType<ImageFormat, unknown> = z.preprocess(
  (format) => (format === "jpg" ? "jpeg" : format),
  canonicalImageFormatSchema,
);

export const imageMediaTypeSchema: z.ZodEnum<{
  "image/png": "image/png";
  "image/jpeg": "image/jpeg";
  "image/webp": "image/webp";
  "image/gif": "image/gif";
}> = z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type ImageMediaType = z.output<typeof imageMediaTypeSchema>;

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
  mediaType: z.ZodOptional<typeof imageMediaTypeSchema>;
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

const supportedInlineImageDataUrlPattern =
  /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i;

/**
 * Transitional image schema. Existing raster data URLs remain readable during
 * the cutover, while every newly completed image is stored as an asset ref.
 */
export const imageSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"image">;
    content: z.ZodString;
    metadata: ImageMetadataSchema;
  }>
> = baseEntityParserSchema
  .extend({
    entityType: z.literal("image"),
    content: z.string(),
    metadata: imageMetadataSchema,
  })
  .superRefine((image, context) => {
    const content = image.content.trim();
    const isAsset = assetRefSchema.safeParse(content).success;
    const isInlineDataUrl = supportedInlineImageDataUrlPattern.test(content);
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

    if (!isAsset && !isInlineDataUrl) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message:
          "Image content must be a supported raster data URL or SHA-256 asset reference",
      });
      return;
    }

    // Existing inline rows predate mediaType/sizeBytes, so require the complete
    // binary fact set only after content crosses to the asset representation.
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

export type Image = z.output<typeof imageSchema>;

/** Display-ready image data for templates that explicitly resolve bytes. */
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
