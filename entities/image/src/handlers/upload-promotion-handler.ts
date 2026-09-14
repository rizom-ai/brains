import {
  BaseJobHandler,
  failPendingEntity,
  saveProcessedEntity,
} from "@brains/plugins";
import type { EntityPluginContext } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { JobResult } from "@brains/contracts";
import { imageAdapter, imageAssetFactsSchema } from "@brains/image";
import { createAssetRef } from "@brains/assets";
import {
  getUploadImageIdentity,
  isSupportedImageMediaType,
  webChatUploadsScope,
} from "../lib/upload-promotion";

export interface UploadPromotionJobData {
  uploadId: string;
  imageId?: string | undefined;
  title?: string | undefined;
}

export const uploadPromotionJobSchema: z.ZodType<UploadPromotionJobData> =
  z.object({
    uploadId: z.string().min(1),
    imageId: z.string().min(1).optional(),
    title: z.string().optional(),
  });

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
    signal: AbortSignal,
  ): Promise<UploadPromotionJobResult> {
    signal.throwIfAborted();
    const state: { publicationEntered: boolean } = {
      publicationEntered: false,
    };
    try {
      await this.reportProgress(progressReporter, {
        progress: 10,
        message: "Reading uploaded image",
      });
      signal.throwIfAborted();

      const files = this.context.entityService.fileAssets;
      if (!files)
        throw new Error("Uploaded image file publication is not provisioned");
      return await this.context.uploads
        .scoped(webChatUploadsScope)
        .withFile(
          data.uploadId,
          async (upload): Promise<UploadPromotionJobResult> => {
            signal.throwIfAborted();
            if (!isSupportedImageMediaType(upload.record.mediaType)) {
              throw new Error(
                "Only image uploads can be promoted to image entities",
              );
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

            const fileAsset = {
              sourceFile: upload.sourceFile,
              sizeBytes: upload.record.sizeBytes,
            };
            const inspected = await files.inspect(fileAsset, { signal });
            signal.throwIfAborted();
            const facts = imageAssetFactsSchema.parse({
              ...inspected.details,
              ref: createAssetRef(inspected.sha256),
              digest: inspected.sha256,
              sizeBytes: inspected.sizeBytes,
            });
            if (facts.mediaType !== upload.record.mediaType.toLowerCase())
              throw new Error(
                "Upload media type does not match its inspected signature",
              );
            const now = new Date().toISOString();
            const imageEntity = imageAdapter.createImageEntity({
              facts,
              title: identity.title,
              status: "draft",
              sourceUploadId: data.uploadId,
              sourceFilename: upload.record.filename,
              sourceMediaType: upload.record.mediaType,
              attachmentType: "uploaded",
            });
            // Publication may commit even if its reply or subsequent cleanup fails.
            // Do not follow an uncertain outcome with another entity mutation.
            state.publicationEntered = true;
            const result = await saveProcessedEntity({
              entityService: this.context.entityService,
              entity: {
                id: imageId,
                ...imageEntity,
                created: now,
                updated: now,
              },
              fileAsset,
              signal,
            });

            // Publication is acknowledged. A cancelled progress channel must
            // not replace the committed result with a cancellation error.
            if (!signal.aborted)
              await this.reportProgress(progressReporter, {
                progress: 100,
                message: "Uploaded image promoted",
              });

            return { entityId: result.entityId, status: "created" };
          },
        );
    } catch (error) {
      // Cancellation is not an ingestion failure. File operations already joined
      // retirement before rejecting; retain their error/cause graph unchanged.
      if (signal.aborted) throw error;
      if (data.imageId && !state.publicationEntered) {
        const errors: unknown[] = [error];
        try {
          await failPendingEntity({
            entityService: this.context.entityService,
            entityType: "image",
            id: data.imageId,
            error: getErrorMessage(error),
          });
        } catch (failureUpdate) {
          errors.push(failureUpdate);
        }
        if (errors.length > 1)
          throw new AggregateError(
            errors,
            "Upload promotion and pending failure update failed",
            { cause: error },
          );
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
