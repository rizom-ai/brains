import {
  assetRecordSchema,
  MAX_ASSET_BYTES,
  type AssetRecord,
} from "@brains/assets";
import { z } from "@brains/utils/zod";
import type { InspectedImage } from "../lib/image-utils";
import { imageFormatSchema, imageMediaTypeSchema } from "./image";

/** Metadata from the producer's inspected asset. No byte backing.
 * Schema validation checks consistency, not provenance or byte integrity;
 * publication must still bind and verify the asset against its owner receipt.
 */
export interface ImageAssetFacts extends AssetRecord, InspectedImage {}

export const imageAssetFactsSchema: z.ZodType<ImageAssetFacts, unknown> =
  assetRecordSchema
    .safeExtend({
      sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
      format: imageFormatSchema,
      mediaType: imageMediaTypeSchema,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .strict()
    .refine((facts) => facts.mediaType === `image/${facts.format}`, {
      message: "Image format and media type must match",
      path: ["mediaType"],
    });
