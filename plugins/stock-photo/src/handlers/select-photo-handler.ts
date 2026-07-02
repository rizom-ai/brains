import { BaseJobHandler } from "@brains/plugins";
import type { IEntityService } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";
import { imageAdapter } from "@brains/image";
import type { FetchImageFn, StockPhotoProvider } from "../lib/types";
import { setCoverImage } from "../lib/set-cover-image";

export const selectPhotoJobSchema = z.object({
  photoId: z.string(),
  downloadLocation: z.string().url(),
  photographerName: z.string(),
  photographerUrl: z.string().url(),
  sourceUrl: z.string().url(),
  imageUrl: z.string().url(),
  title: z.string().optional(),
  alt: z.string().optional(),
  targetEntityType: z.string().optional(),
  targetEntityId: z.string().optional(),
});

export type SelectPhotoJobData = z.infer<typeof selectPhotoJobSchema>;

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
  constructor(
    logger: Logger,
    private readonly deps: SelectPhotoHandlerDeps,
  ) {
    super(logger, {
      schema: selectPhotoJobSchema,
      jobTypeName: "select-photo",
    });
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
