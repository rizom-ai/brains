import { z } from "@brains/utils/zod";
import { MAX_ASSET_BYTES } from "@brains/assets";
import { fileProducePathSchema } from "@brains/db/file-produce";
import { imageFormatSchema, type ImageFormat } from "./schemas/image";

export const RESPONSIVE_IMAGE_WIDTHS: readonly number[] = [480, 960, 1920];
export const RESPONSIVE_IMAGE_MANIFEST_BYTES: number = 8192;
export interface ResponsiveImageRequest {
  sourceFile: string;
  sizeBytes: number;
  sha256: string;
}
export const responsiveImageRequestSchema: z.ZodType<ResponsiveImageRequest> =
  z.strictObject({
    sourceFile: fileProducePathSchema,
    sizeBytes: z.coerce.number().int().positive().max(MAX_ASSET_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  });
export interface ResponsiveImageVariant {
  filename: string;
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
}
export interface ResponsiveImageManifest {
  source: {
    sha256: string;
    sizeBytes: number;
    width: number;
    height: number;
    format: ImageFormat;
  };
  variants: ResponsiveImageVariant[];
}
export const responsiveImageManifestSchema: z.ZodType<ResponsiveImageManifest> =
  z
    .strictObject({
      source: z.strictObject({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        format: imageFormatSchema,
      }),
      variants: z
        .array(
          z.strictObject({
            filename: z.string().regex(/^[a-f0-9]{16}-(480|960|1920)w\.webp$/),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          }),
        )
        .max(3),
    })
    .refine((manifest) => {
      const widths = RESPONSIVE_IMAGE_WIDTHS.filter(
        (width) => width <= manifest.source.width,
      );
      return (
        manifest.variants.length === widths.length &&
        manifest.variants.every(
          (variant, index) =>
            variant.width === widths[index] &&
            variant.height ===
              Math.max(
                1,
                Math.floor(
                  (manifest.source.height * variant.width) /
                    manifest.source.width,
                ),
              ) &&
            variant.filename ===
              `${manifest.source.sha256.slice(0, 16)}-${variant.width}w.webp`,
        )
      );
    }, "Responsive image manifest does not match its source and variants");
