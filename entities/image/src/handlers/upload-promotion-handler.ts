import { BaseJobHandler } from "@brains/plugins";
import type { EntityPluginContext } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";
import { imageAdapter } from "@brains/image";
import {
  getUploadImageIdentity,
  isSupportedImageMediaType,
  toDataUrl,
  webChatUploadsScope,
} from "../lib/upload-promotion";

export const uploadPromotionJobSchema = z.object({
  uploadId: z.string().min(1),
  title: z.string().optional(),
});

export type UploadPromotionJobData = z.infer<typeof uploadPromotionJobSchema>;

export interface UploadPromotionJobResult {
  entityId: string;
  status: "created";
}

export class UploadPromotionJobHandler extends BaseJobHandler<
  "upload-promote",
  UploadPromotionJobData,
  UploadPromotionJobResult
> {
  constructor(
    logger: Logger,
    private readonly context: EntityPluginContext,
  ) {
    super(logger, {
      schema: uploadPromotionJobSchema,
      jobTypeName: "upload-promote",
    });
  }

  async process(
    data: UploadPromotionJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<UploadPromotionJobResult> {
    await this.reportProgress(progressReporter, {
      progress: 10,
      message: "Reading uploaded image",
    });

    const upload = await this.context.uploads
      .scoped(webChatUploadsScope)
      .read(data.uploadId);

    if (!isSupportedImageMediaType(upload.record.mediaType)) {
      throw new Error("Only image uploads can be promoted to image entities");
    }

    const identity = getUploadImageIdentity({
      filename: upload.record.filename,
      ...(data.title !== undefined ? { title: data.title } : {}),
    });

    await this.reportProgress(progressReporter, {
      progress: 60,
      message: "Saving uploaded image",
    });

    const now = new Date().toISOString();
    const imageEntity = imageAdapter.createImageEntity({
      dataUrl: toDataUrl(upload.record.mediaType, upload.content),
      title: identity.title,
    });
    const result = await this.context.entityService.createEntity({
      entity: {
        id: identity.id,
        ...imageEntity,
        created: now,
        updated: now,
      },
      options: { deduplicateId: true },
    });

    await this.reportProgress(progressReporter, {
      progress: 100,
      message: "Uploaded image promoted",
    });

    return { entityId: result.entityId, status: "created" };
  }

  protected override summarizeDataForLog(
    data: UploadPromotionJobData,
  ): Record<string, unknown> {
    return {
      uploadId: data.uploadId,
      hasTitle: data.title !== undefined,
    };
  }
}
