import {
  firstPartyJobHandler,
  type FirstPartyJobHandler,
  type ServiceEntityMutations,
} from "@brains/sdk/internal/service-runtime";
import type { StockPhotoEntityWriter } from "../lib/set-cover-image";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { stageImageEntity } from "@brains/image";
import type { FetchImageFn, StockPhotoProvider } from "../lib/types";
import { setCoverImage } from "../lib/set-cover-image";

export const selectPhotoJobSchema: z.ZodObject<{
  photoId: z.ZodString;
  downloadLocation: z.ZodURL;
  photographerName: z.ZodString;
  photographerUrl: z.ZodURL;
  sourceUrl: z.ZodURL;
  imageUrl: z.ZodURL;
  title: z.ZodOptional<z.ZodString>;
  alt: z.ZodOptional<z.ZodString>;
  targetEntityType: z.ZodOptional<z.ZodString>;
  targetEntityId: z.ZodOptional<z.ZodString>;
}> = z.object({
  photoId: z.string(),
  downloadLocation: z.url(),
  photographerName: z.string(),
  photographerUrl: z.url(),
  sourceUrl: z.url(),
  imageUrl: z.url(),
  title: z.string().optional(),
  alt: z.string().optional(),
  targetEntityType: z.string().optional(),
  targetEntityId: z.string().optional(),
});

export type SelectPhotoJobData = z.output<typeof selectPhotoJobSchema>;
export type SelectPhotoJobDataInput = z.input<typeof selectPhotoJobSchema>;

export interface SelectPhotoJobResult {
  imageEntityId: string;
  alreadyExisted: false;
  coverSet?: boolean;
  warning?: string;
}

export interface SelectPhotoHandlerDeps {
  provider: StockPhotoProvider;
  entityService: StockPhotoEntityWriter;
  fetchImage: FetchImageFn;
  /** The job's durable done-markers, kept by the entity service's receipts. */
  receipts: Pick<
    ServiceEntityMutations,
    "getEntityMutationReceipt" | "applyEntityMutationOnce"
  >;
}

/**
 * Ping the provider's download tracker once for this job: each use of a
 * photo is tracked, as the provider's terms require, and a rerun of a job
 * that already pinged it does not ping again.
 */
async function trackDownloadOnce(
  deps: SelectPhotoHandlerDeps,
  jobId: string,
  downloadLocation: string,
): Promise<void> {
  const tracked = { namespace: "stock-photo.download-tracked", key: jobId };
  if (await deps.receipts.getEntityMutationReceipt(tracked)) return;
  await deps.provider.triggerDownload(downloadLocation);
  await deps.receipts.applyEntityMutationOnce({
    receipt: tracked,
    operation: "none",
  });
}

/** Download the photo and store it as an image under the photo's id. */
async function savePhoto(
  deps: SelectPhotoHandlerDeps,
  data: SelectPhotoJobData,
  progress: ProgressReporter,
): Promise<string> {
  await step(progress, 35, "Downloading stock photo");

  const dataUrl = await deps.fetchImage(data.imageUrl);
  const imageTitle = data.title ?? `Stock photo ${data.photoId}`;
  // The fetched data URL is decoded while staging and never stored.
  const { entity: imageData, stagedAsset } = await stageImageEntity(
    deps.entityService,
    { dataUrl },
    {
      title: imageTitle,
      alt: data.alt ?? imageTitle,
      sourceUrl: data.imageUrl,
    },
  );

  await step(progress, 75, "Saving stock photo");

  const { entityId } = await deps.entityService.createEntity({
    entity: { id: data.photoId, ...imageData },
    stagedAsset,
  });
  return entityId;
}

/** One progress step, out of a hundred. */
function step(
  progress: ProgressReporter,
  value: number,
  message: string,
): Promise<void> {
  return progress.report({ progress: value, total: 100, message });
}

/**
 * Materialize a selected stock photo: track the download, as the provider's
 * terms require, store the photo as an image under the photo's id with its
 * source URL, and set it as the target's cover when one is named. A photo
 * already stored, by an earlier attempt of this job or by another job, is
 * reused rather than downloaded again. Queued by the select tool under
 * stock-photo:select-photo, and run as the package: nobody is attributed
 * and no action policy is checked.
 */
export function selectPhotoJob(
  deps: SelectPhotoHandlerDeps,
): FirstPartyJobHandler {
  return firstPartyJobHandler({
    type: "select-photo",
    input: selectPhotoJobSchema,
    summarize: (data) => ({
      photoId: data.photoId,
      hasTarget: data.targetEntityType !== undefined,
    }),
    process: async ({
      input: data,
      jobId,
      progress,
    }): Promise<SelectPhotoJobResult> => {
      await step(progress, 10, "Tracking stock photo download");

      await trackDownloadOnce(deps, jobId, data.downloadLocation);

      const stored = await deps.entityService.getEntity({
        entityType: "image",
        id: data.photoId,
      });
      const entityId = stored
        ? stored.id
        : await savePhoto(deps, data, progress);

      const result: SelectPhotoJobResult = {
        imageEntityId: entityId,
        alreadyExisted: false,
      };

      if (data.targetEntityType && data.targetEntityId) {
        result.coverSet = await setCoverImage(
          deps.entityService,
          data.targetEntityType,
          data.targetEntityId,
          entityId,
        );
        if (!result.coverSet) {
          result.warning = `Target entity ${data.targetEntityType}:${data.targetEntityId} not found; cover image not set`;
        }
      }

      await step(progress, 100, "Stock photo selected");

      return result;
    },
  });
}
