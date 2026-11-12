import { imageAspectRatioSchema } from "@brains/contracts";
import {
  defineEntityPackage,
  z,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { image } from "./image";

/**
 * The package's settings, as the image entity plugin took them; a brain
 * config naming one stays valid.
 */
export const imageConfigSchema: z.ZodObject<{
  defaultAspectRatio: z.ZodDefault<typeof imageAspectRatioSchema>;
}> = z.object({
  defaultAspectRatio: imageAspectRatioSchema
    .default("16:9")
    .describe("Default aspect ratio for generated images"),
});

/** Images: generated, rendered from attachments, or promoted from uploads. */
export const imagePackage: EntityPackageDefinition<
  readonly [typeof image],
  readonly [],
  typeof imageConfigSchema
> = defineEntityPackage({
  id: "image",
  config: imageConfigSchema,
  entities: [image],
});

export default imagePackage;

export { image } from "./image";
export {
  uploadPromotionJobContract,
  uploadPromotionJobSchema,
  type UploadPromotionJobData,
  type UploadPromotionJobResult,
} from "./jobs/promote-upload";
