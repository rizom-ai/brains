import {
  BaseJobHandler,
  failPendingEntity,
  saveProcessedEntity,
} from "@brains/plugins";
import type { EntityPluginContext } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { getErrorMessage } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";
import { JobResult } from "@brains/contracts";
import { imageAdapter } from "@brains/image";
import {
  getUploadImageIdentity,
  isSupportedImageMediaType,
  toDataUrl,
  webChatUploadsScope,
} from "../lib/upload-promotion";

export const uploadPromotionJobSchema = z.object({
  uploadId: z.string().min(1),
  imageId: z.string().min(1).optional(),
  title: z.string().optional(),
});

export type UploadPromotionJobData = z.output<typeof uploadPromotionJobSchema>;

export type UploadPromotionJobResult =
  | {
      entityId: string;
      status: "created";
    }
  | {
      success: false;
      error: string;
    };

export class UploadPromotionJobHandler extends BaseJobHandler<
  "upload-promote",
  UploadPromotionJobData,
  UploadPromotionJobResult
> {
  private readonly context: EntityPluginContext;
  constructor(logger: Logger, context: EntityPluginContext) {
    super(logger, {
      schema: uploadPromotionJobSchema,
      jobTypeName: "upload-promote",
    });
    this.context = context;
  }

  async process(
    data: UploadPromotionJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<UploadPromotionJobResult> {
    try {
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
      const imageId = data.imageId ?? identity.id;

      await this.reportProgress(progressReporter, {
        progress: 60,
        message: "Saving uploaded image",
      });

      const now = new Date().toISOString();
      const imageEntity = imageAdapter.createImageEntity({
        dataUrl: toDataUrl(upload.record.mediaType, upload.content),
        title: identity.title,
        status: "draft",
        sourceUploadId: data.uploadId,
        sourceFilename: upload.record.filename,
        sourceMediaType: upload.record.mediaType,
        attachmentType: "uploaded",
      });
      const result = await saveProcessedEntity({
        entityService: this.context.entityService,
        entity: {
          id: imageId,
          ...imageEntity,
          created: now,
          updated: now,
        },
      });

      await this.reportProgress(progressReporter, {
        progress: 100,
        message: "Uploaded image promoted",
      });

      return { entityId: result.entityId, status: "created" };
    } catch (error) {
      if (data.imageId) {
        await failPendingEntity({
          entityService: this.context.entityService,
          entityType: "image",
          id: data.imageId,
          error: getErrorMessage(error),
        });
      }
      return JobResult.failure(error);
    }
  }

  protected override summarizeDataForLog(
    data: UploadPromotionJobData,
  ): Record<string, unknown> {
    return {
      uploadId: data.uploadId,
      imageId: data.imageId,
      hasTitle: data.title !== undefined,
    };
  }
}
