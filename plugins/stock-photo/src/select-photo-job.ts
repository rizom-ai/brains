import { defineJob, z } from "@brains/sdk/services";
import type { ServiceJobDefinition } from "@brains/sdk/services";
import type { FetchImageFn, StockPhotoProvider } from "./lib/types";

/**
 * What a selection carries: enough to fetch the picture, to credit it, and to
 * say whose cover it is to be. Attribution is answered to the agent by the
 * select tool; the job needs the rest.
 */
export const selectPhotoInputSchema: z.ZodObject<{
  photoId: z.ZodString;
  downloadLocation: z.ZodURL;
  photographerName: z.ZodString;
  photographerUrl: z.ZodURL;
  sourceUrl: z.ZodURL;
  imageUrl: z.ZodURL;
  title: z.ZodOptional<z.ZodString>;
  targetEntityType: z.ZodOptional<z.ZodString>;
  targetEntityId: z.ZodOptional<z.ZodString>;
}> = z.object({
  photoId: z.string().describe("Photo ID from search results"),
  downloadLocation: z
    .url()
    .describe("Download tracking URL (required by provider ToS)"),
  photographerName: z.string().describe("Photographer name for attribution"),
  photographerUrl: z.url().describe("Photographer profile URL for attribution"),
  sourceUrl: z.url().describe("Photo page URL on provider"),
  imageUrl: z.url().describe("Image URL to download"),
  title: z.string().optional().describe("Image entity title"),
  targetEntityType: z
    .string()
    .optional()
    .describe("Entity type to set cover image on"),
  targetEntityId: z
    .string()
    .optional()
    .describe("Entity ID to set cover image on"),
});

export type SelectPhotoInput = z.output<typeof selectPhotoInputSchema>;

const selectPhotoOutputSchema: z.ZodObject<{
  imageEntityId: z.ZodString;
  alreadyExisted: z.ZodBoolean;
  coverSet: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  imageEntityId: z.string(),
  alreadyExisted: z.boolean(),
  coverSet: z.boolean().optional(),
});

export const selectPhotoJob: ServiceJobDefinition<
  "select-photo",
  typeof selectPhotoInputSchema,
  typeof selectPhotoOutputSchema
> = defineJob({
  name: "select-photo",
  input: selectPhotoInputSchema,
  output: selectPhotoOutputSchema,
});

export interface SelectPhotoDependencies {
  readonly provider: StockPhotoProvider;
  readonly fetchImage: FetchImageFn;
}

/**
 * Track the download, fetch the bytes, and hand them to the image type.
 *
 * The image route — the one `system_create` takes — names the picture,
 * stores it once per source URL, and links it into the target's cover. A
 * target that is gone, or a type that takes no cover, is refused there, and
 * the refusal fails this job: a cover with nothing to be the cover of was
 * not what was asked for.
 */
export function handleSelectPhoto(
  deps: SelectPhotoDependencies,
): ReturnType<typeof selectPhotoJob.handle> {
  return selectPhotoJob.handle(async ({ input, createRouted, progress }) => {
    await progress.report({
      progress: 10,
      message: "Tracking stock photo download",
    });
    await deps.provider.triggerDownload(input.downloadLocation);

    await progress.report({ progress: 35, message: "Downloading stock photo" });
    const content = await deps.fetchImage(input.imageUrl);

    await progress.report({ progress: 75, message: "Saving stock photo" });
    const target =
      input.targetEntityType !== undefined && input.targetEntityId !== undefined
        ? {
            targetEntityType: input.targetEntityType,
            targetEntityId: input.targetEntityId,
          }
        : undefined;
    const result = await createRouted({
      entityType: "image",
      content,
      title: input.title ?? `Stock photo ${input.photoId}`,
      url: input.imageUrl,
      ...target,
    });
    if (!result.success) throw new Error(result.error);
    if (!result.data.entityId) {
      throw new Error("The image route answered without an entity id");
    }

    await progress.report({ progress: 100, message: "Stock photo selected" });
    return {
      imageEntityId: result.data.entityId,
      alreadyExisted: result.data.status === "existing",
      ...(target ? { coverSet: true } : {}),
    };
  });
}
