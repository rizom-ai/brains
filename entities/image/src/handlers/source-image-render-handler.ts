import type { EntityPluginContext } from "@brains/plugins";
import {
  BaseJobHandler,
  failPendingEntity,
  findEntityByIdentifier,
  saveProcessedEntity,
} from "@brains/plugins";
import type { ProgressReporter, Logger } from "@brains/utils";
import { getErrorMessage, z } from "@brains/utils";
import { PROGRESS_STEPS, JobResult } from "@brains/contracts";
import {
  createDataUrl,
  imageAdapter,
  setCoverImageId,
  setOgImageId,
  type Image,
} from "@brains/image";

export const sourceImageRenderJobDataSchema = z.object({
  sourceEntityType: z.string().min(1),
  sourceEntityId: z.string().min(1),
  attachmentType: z.string().min(1),
  imageId: z.string().min(1),
  dedupKey: z.string().min(1).optional(),
  replace: z.boolean().optional(),
  targetEntityType: z.string().min(1).optional(),
  targetEntityId: z.string().min(1).optional(),
  targetImageField: z.enum(["coverImageId", "ogImageId"]).optional(),
});

export type SourceImageRenderJobData = z.infer<
  typeof sourceImageRenderJobDataSchema
>;

interface SourceImageRenderResult {
  success: boolean;
  imageId?: string;
  reused?: boolean;
  error?: string;
}

export class SourceImageRenderJobHandler extends BaseJobHandler<
  "image-render-source",
  SourceImageRenderJobData,
  SourceImageRenderResult
> {
  private readonly context: EntityPluginContext;
  constructor(context: EntityPluginContext, logger: Logger) {
    super(logger, {
      schema: sourceImageRenderJobDataSchema,
      jobTypeName: "image-render-source",
    });
    this.context = context;
  }

  async process(
    data: SourceImageRenderJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<SourceImageRenderResult> {
    this.logger.debug("Starting source image render job", {
      jobId,
      sourceEntityType: data.sourceEntityType,
      sourceEntityId: data.sourceEntityId,
      attachmentType: data.attachmentType,
      imageId: data.imageId,
    });

    try {
      if (data.replace !== true && data.dedupKey) {
        const existing = await this.findImageByDedupKey(data.dedupKey);
        if (existing) {
          await this.updateTarget(data, existing.id);
          await this.reportProgress(progressReporter, {
            progress: PROGRESS_STEPS.COMPLETE,
            message: "Reusing existing generated image",
          });
          return { success: true, imageId: existing.id, reused: true };
        }
      }

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.PROCESS,
        message: "Rendering source image",
      });

      const attachment = await this.context.attachments.resolve({
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
        attachmentType: data.attachmentType,
      });
      if (!attachment) {
        return JobResult.failure(
          new Error(
            `No attachment provider found for ${data.sourceEntityType}/${data.attachmentType}`,
          ),
        );
      }
      if (attachment.type !== "image") {
        return JobResult.failure(
          new Error(
            `Attachment provider returned ${attachment.type}; expected image`,
          ),
        );
      }

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.GENERATE,
        message: "Creating image entity",
      });

      // Derive the data-URL format from the attachment's declared mime type
      // rather than hardcoding "png", so it stays correct if providers ever
      // emit another image format.
      const imageFormat = attachment.mimeType.split("/")[1] ?? "png";
      const entityData = imageAdapter.createImageEntity({
        dataUrl: createDataUrl(attachment.data.toString("base64"), imageFormat),
        title: data.imageId,
        status: "draft",
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
        attachmentType: data.attachmentType,
        ...(data.dedupKey && { dedupKey: data.dedupKey }),
      });

      await saveProcessedEntity({
        entityService: this.context.entityService,
        entity: { ...entityData, id: data.imageId },
      });

      await this.updateTarget(data, data.imageId);

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: "Image render complete",
      });

      return { success: true, imageId: data.imageId, reused: false };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error("Source image render job failed", {
        jobId,
        error: errorMessage,
      });
      await failPendingEntity({
        entityService: this.context.entityService,
        entityType: "image",
        id: data.imageId,
        error: errorMessage,
      });
      return JobResult.failure(error);
    }
  }

  private async findImageByDedupKey(
    dedupKey: string,
  ): Promise<Image | undefined> {
    const images = await this.context.entityService.listEntities<Image>({
      entityType: "image",
      options: { filter: { metadata: { dedupKey } } },
    });
    return images.find(
      (image) =>
        image.metadata.status !== "pending" &&
        image.metadata.status !== "failed",
    );
  }

  private async updateTarget(
    data: SourceImageRenderJobData,
    imageId: string,
  ): Promise<void> {
    if (!data.targetEntityType || !data.targetEntityId) return;

    const targetEntity = await findEntityByIdentifier(
      this.context.entityService,
      data.targetEntityType,
      data.targetEntityId,
      this.logger,
    );
    if (!targetEntity) {
      throw new Error(
        `Target entity not found: ${data.targetEntityType}/${data.targetEntityId}`,
      );
    }

    const field = data.targetImageField ?? "coverImageId";
    const updated =
      field === "ogImageId"
        ? setOgImageId(targetEntity, imageId)
        : setCoverImageId(targetEntity, imageId);
    await this.context.entities.update(updated);
  }
}
