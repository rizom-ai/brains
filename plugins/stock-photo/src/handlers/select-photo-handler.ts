import { BaseJobHandler } from "@brains/plugins";
import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { imageAdapter } from "@brains/image";
import type { FetchImageFn, StockPhotoProvider } from "../lib/types";
import { setCoverImage } from "../lib/set-cover-image";

export interface SelectPhotoJobData {
  photoId: string;
  downloadLocation: string;
  photographerName: string;
  photographerUrl: string;
  sourceUrl: string;
  imageUrl: string;
  title?: string | undefined;
  alt?: string | undefined;
  targetEntityType?: string | undefined;
  targetEntityId?: string | undefined;
}

export type SelectPhotoJobDataInput = SelectPhotoJobData;

export const selectPhotoJobSchema: z.ZodType<
  SelectPhotoJobData,
  SelectPhotoJobDataInput
> = z.object({
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

export interface SelectPhotoJobResult {
  imageEntityId: string;
  alreadyExisted: false;
  coverSet?: boolean;
  warning?: string;
}

export interface SelectPhotoHandlerDeps {
  provider: StockPhotoProvider;
  entityService: IEntityService;
  fetchImage: FetchImageFn;
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
  ): Promise<SelectPhotoJobResult> {
    await this.reportProgress(progressReporter, {
      progress: 10,
      message: "Tracking stock photo download",
    });

    await this.deps.provider.triggerDownload(data.downloadLocation);

    await this.reportProgress(progressReporter, {
      progress: 35,
      message: "Downloading stock photo",
    });

    const dataUrl = await this.deps.fetchImage(data.imageUrl);
    const imageTitle = data.title ?? `Stock photo ${data.photoId}`;
    const imageData = imageAdapter.createImageEntity({
      dataUrl,
      title: imageTitle,
      alt: data.alt ?? imageTitle,
    });

    await this.reportProgress(progressReporter, {
      progress: 75,
      message: "Saving stock photo",
    });

    const { entityId } = await this.deps.entityService.createEntity({
      entity: {
        id: data.photoId,
        ...imageData,
        metadata: {
          ...imageData.metadata,
          sourceUrl: data.imageUrl,
        },
      },
    });

    const result: SelectPhotoJobResult = {
      imageEntityId: entityId,
      alreadyExisted: false,
    };

    if (data.targetEntityType && data.targetEntityId) {
      result.coverSet = await setCoverImage(
        this.deps.entityService,
        data.targetEntityType,
        data.targetEntityId,
        entityId,
      );
      if (!result.coverSet) {
        result.warning = `Target entity ${data.targetEntityType}:${data.targetEntityId} not found; cover image not set`;
      }
    }

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
