import { BaseJobHandler } from "@brains/plugins";
import type { StockPhotoEntityWriter } from "../lib/set-cover-image";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { imageAdapter, imageAssetFactsSchema } from "@brains/image";
import { createAssetRef } from "@brains/assets";
import type { StockPhotoProvider } from "../lib/types";
import {
  setCoverImage,
  CoverImageUpdateCancelled,
} from "../lib/set-cover-image";

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
}

export class SelectPhotoJobHandler extends BaseJobHandler<
  "select-photo",
  SelectPhotoJobData,
  SelectPhotoJobResult
> {
  private readonly deps: SelectPhotoHandlerDeps;
  constructor(logger: Logger, deps: SelectPhotoHandlerDeps) {
    super(logger, {
      schema: selectPhotoJobSchema,
      jobTypeName: "select-photo",
    });
    this.deps = deps;
  }

  async process(
    data: SelectPhotoJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
    signal?: AbortSignal,
  ): Promise<SelectPhotoJobResult> {
    signal?.throwIfAborted();
    const files = this.deps.entityService.fileAssets;
    if (!files?.withRemoteFile)
      throw new Error("Stock photo file ingress is not provisioned");
    await this.reportProgress(progressReporter, {
      progress: 10,
      message: "Tracking stock photo download",
    });

    signal?.throwIfAborted();
    await this.deps.provider.triggerDownload(data.downloadLocation);
    signal?.throwIfAborted();

    await this.reportProgress(progressReporter, {
      progress: 35,
      message: "Downloading stock photo",
    });

    const { entityId } = await files.withRemoteFile(
      data.imageUrl,
      async (file, transferSignal): ReturnType<typeof files.publish> => {
        const facts = imageAssetFactsSchema.parse({
          ...file.details,
          ref: createAssetRef(file.sha256),
          digest: file.sha256,
          sizeBytes: file.sizeBytes,
        });
        const title = data.title ?? `Stock photo ${data.photoId}`;
        const imageData = imageAdapter.createImageEntity({
          facts,
          title,
          alt: data.alt ?? title,
          sourceUrl: data.imageUrl,
        });
        await this.reportProgress(progressReporter, {
          progress: 75,
          message: "Saving stock photo",
        });
        return files.publish(
          {
            sourceFile: file.sourceFile,
            sizeBytes: file.sizeBytes,
            publication: {
              operation: "createEntity",
              request: { entity: { id: data.photoId, ...imageData } },
            },
          },
          { signal: transferSignal },
        );
      },
      { signal },
    );

    const result: SelectPhotoJobResult = {
      imageEntityId: entityId,
      alreadyExisted: false,
    };

    if (data.targetEntityType && data.targetEntityId) {
      try {
        result.coverSet = await setCoverImage(
          this.deps.entityService,
          data.targetEntityType,
          data.targetEntityId,
          entityId,
          signal,
        );
        if (!result.coverSet)
          result.warning = `Target entity ${data.targetEntityType}:${data.targetEntityId} not found; cover image not set`;
      } catch (error) {
        // An acknowledged image is not retracted when cancellation prevents the
        // separate target update. Unrelated target failures still propagate.
        if (!(error instanceof CoverImageUpdateCancelled)) throw error;
        result.coverSet = false;
        result.warning = "Image saved; cover image update cancelled";
      }
    }

    if (!signal?.aborted)
      await this.reportProgress(progressReporter, {
        progress: 100,
        message: "Stock photo selected",
      });

    return result;
  }

  protected override summarizeDataForLog(
    data: SelectPhotoJobData,
  ): Record<string, unknown> {
    return {
      photoId: data.photoId,
      hasTarget: data.targetEntityType !== undefined,
    };
  }
}
