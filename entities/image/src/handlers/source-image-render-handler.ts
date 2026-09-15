import type { EntityPluginContext } from "@brains/plugins";
import {
  BaseJobHandler,
  failPendingEntity,
  findEntityByIdentifier,
  saveProcessedEntity,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { PROGRESS_STEPS, JobResult } from "@brains/contracts";
import { createAssetRef } from "@brains/assets";
import {
  imageAdapter,
  imageAssetFactsSchema,
  imageSchema,
  setCoverImageId,
  setOgImageId,
  type Image,
} from "@brains/image";

export interface SourceImageRenderJobData {
  sourceEntityType: string;
  sourceEntityId: string;
  attachmentType: string;
  imageId: string;
  dedupKey?: string | undefined;
  replace?: boolean | undefined;
  targetEntityType?: string | undefined;
  targetEntityId?: string | undefined;
  targetImageField?: "coverImageId" | "ogImageId" | undefined;
}

export const sourceImageRenderJobDataSchema: z.ZodType<SourceImageRenderJobData> =
  z.object({
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

interface SourceImageRenderResult {
  success: boolean;
  imageId?: string;
  reused?: boolean;
  error?: string;
  warning?: string;
}
class TargetUpdateCancelled extends Error {}
function assertTargetLive(signal: AbortSignal): void {
  if (signal.aborted)
    throw new TargetUpdateCancelled(
      "Target update cancelled before admission",
      { cause: signal.reason },
    );
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
    signal: AbortSignal,
  ): Promise<SourceImageRenderResult> {
    signal.throwIfAborted();
    const state: { preserveImage: boolean } = { preserveImage: false };
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
        signal.throwIfAborted();
        if (existing) {
          state.preserveImage = true;
          return await this.finish(
            data,
            existing.id,
            true,
            progressReporter,
            signal,
          );
        }
      }

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.PROCESS,
        message: "Rendering source image",
      });

      signal.throwIfAborted();
      const files = this.context.entityService.fileAssets;
      if (!files)
        throw new Error("Rendered image file publication is not provisioned");
      const published = await this.context.attachments.withFile(
        {
          sourceEntityType: data.sourceEntityType,
          sourceEntityId: data.sourceEntityId,
          attachmentType: data.attachmentType,
        },
        async (attachment, transferSignal): Promise<boolean> => {
          if (attachment.type !== "image")
            throw new Error(
              `Attachment provider returned ${attachment.type}; expected image`,
            );
          const inspected = await files.inspect(attachment.source, {
            signal: transferSignal,
          });
          transferSignal.throwIfAborted();
          const facts = imageAssetFactsSchema.parse({
            ...inspected.details,
            ref: createAssetRef(inspected.sha256),
            digest: inspected.sha256,
            sizeBytes: inspected.sizeBytes,
          });
          if (
            facts.mediaType !== attachment.mimeType ||
            facts.sizeBytes !== attachment.source.sizeBytes ||
            facts.digest !== attachment.sha256
          )
            throw new Error(
              "Rendered image file does not match its attachment metadata",
            );
          await this.reportProgress(progressReporter, {
            progress: PROGRESS_STEPS.GENERATE,
            message: "Creating image entity",
          });
          const entityData = imageAdapter.createImageEntity({
            facts,
            title: data.imageId,
            status: "draft",
            sourceEntityType: data.sourceEntityType,
            sourceEntityId: data.sourceEntityId,
            attachmentType: data.attachmentType,
            ...(data.dedupKey && { dedupKey: data.dedupKey }),
          });
          // Observe publication and provider cleanup; neither uncertainty permits
          // a later failed-placeholder mutation or a replay of publication.
          state.preserveImage = true;
          await saveProcessedEntity({
            entityService: this.context.entityService,
            entity: { ...entityData, id: data.imageId },
            fileAsset: attachment.source,
            signal: transferSignal,
          });
          return true;
        },
        { signal },
      );
      if (!published)
        return JobResult.failure(
          new Error(
            `No attachment provider found for ${data.sourceEntityType}/${data.attachmentType}`,
          ),
        );
      return await this.finish(
        data,
        data.imageId,
        false,
        progressReporter,
        signal,
      );
    } catch (error) {
      if (signal.aborted) throw error;
      const errorMessage = getErrorMessage(error);
      this.logger.error("Source image render job failed", {
        jobId,
        error: errorMessage,
      });
      if (!state.preserveImage) {
        const errors: unknown[] = [error];
        try {
          await failPendingEntity({
            entityService: this.context.entityService,
            entityType: "image",
            id: data.imageId,
            error: errorMessage,
          });
        } catch (failureUpdate) {
          errors.push(failureUpdate);
        }
        if (errors.length > 1)
          throw new AggregateError(
            errors,
            "Source rendering and pending failure update failed",
            { cause: error },
          );
      }
      return JobResult.failure(error);
    }
  }

  private async finish(
    data: SourceImageRenderJobData,
    imageId: string,
    reused: boolean,
    progressReporter: ProgressReporter,
    signal: AbortSignal,
  ): Promise<SourceImageRenderResult> {
    let warning: string | undefined;
    try {
      await this.updateTarget(data, imageId, signal);
    } catch (error) {
      if (!(error instanceof TargetUpdateCancelled)) throw error;
      warning = "Image saved; target update cancelled";
    }
    if (!signal.aborted)
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: reused
          ? "Reusing existing generated image"
          : "Image render complete",
      });
    return { success: true, imageId, reused, ...(warning && { warning }) };
  }

  private async findImageByDedupKey(
    dedupKey: string,
  ): Promise<Image | undefined> {
    const images = await this.context.entityService.listEntities(
      {
        entityType: "image",
        options: { filter: { metadata: { dedupKey } } },
      },
      imageSchema,
    );
    return images.find(
      (image) =>
        image.metadata.status !== "pending" &&
        image.metadata.status !== "failed",
    );
  }

  private async updateTarget(
    data: SourceImageRenderJobData,
    imageId: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (!data.targetEntityType || !data.targetEntityId) return;
    assertTargetLive(signal);

    const targetEntity = await findEntityByIdentifier(
      this.context.entityService,
      data.targetEntityType,
      data.targetEntityId,
      this.logger,
    );
    assertTargetLive(signal);
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
