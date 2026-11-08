import {
  JobResult,
  PROGRESS_STEPS,
  imageRenderSourceJobContract,
  type ImageRenderSourceJobInput,
} from "@brains/contracts";
import {
  createDataUrl,
  createImageEntity,
  imageMetadataSchema,
} from "@brains/image";
import type {
  EntityDefinition,
  EntityJobDeclaration,
} from "@brains/sdk/entities";
import {
  contractJob,
  entityRuntime,
  type EntityRuntime,
} from "@brains/sdk/internal/entity-runtime";
import { bufferView } from "@brains/utils/bytes";
import { getErrorMessage } from "@brains/utils/error";
import { failPendingImage, saveProcessedImage } from "../lib/processed-image";

type ImageDefinition = EntityDefinition<"image", typeof imageMetadataSchema>;

interface SourceImageRenderResult {
  success: boolean;
  imageId?: string;
  reused?: boolean;
  error?: string;
}

/**
 * An image already rendered from the same source attachment, read public as
 * the entity plugin class read it: a pending or failed one is not reused.
 */
async function findImageByDedupKey(
  runtime: EntityRuntime,
  dedupKey: string,
): Promise<{ readonly id: string } | undefined> {
  const images = await runtime.anyEntities.listEntities({
    entityType: "image",
    options: { filter: { metadata: { dedupKey } } },
  });
  return images.find((image) => {
    const { status } = imageMetadataSchema.parse(image.metadata);
    return status !== "pending" && status !== "failed";
  });
}

/** Point the target's cover or OG image at the rendered image. */
async function updateTarget(
  runtime: EntityRuntime,
  data: ImageRenderSourceJobInput,
  imageId: string,
): Promise<void> {
  if (!data.targetEntityType || !data.targetEntityId) return;
  const targetEntity = await runtime.anyEntities.find(
    data.targetEntityType,
    data.targetEntityId,
  );
  if (!targetEntity) {
    throw new Error(
      `Target entity not found: ${data.targetEntityType}/${data.targetEntityId}`,
    );
  }
  await runtime.linkInto(imageId, {
    entityType: data.targetEntityType,
    entityId: targetEntity.id,
    field: data.targetImageField ?? "coverImageId",
  });
}

/**
 * An image rendered from another entity's attachment, such as its OG
 * preview, queued by image's own routes and by content-pipeline through
 * `image:image-render-source`. A render already made from the same source
 * is reused unless the job asks to replace it.
 */
export function renderSourceImageJob(
  image: () => ImageDefinition,
): EntityJobDeclaration<typeof imageRenderSourceJobContract.input> {
  return contractJob(imageRenderSourceJobContract, {
    handle: async (context): Promise<SourceImageRenderResult> => {
      const data: ImageRenderSourceJobInput = context.input;
      const { entities, progress } = context;
      const runtime = entityRuntime(context);
      runtime.logger.debug("Starting source image render job", {
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
        attachmentType: data.attachmentType,
        imageId: data.imageId,
      });

      try {
        if (data.replace !== true && data.dedupKey) {
          const existing = await findImageByDedupKey(runtime, data.dedupKey);
          if (existing) {
            await updateTarget(runtime, data, existing.id);
            await progress.report({
              progress: PROGRESS_STEPS.COMPLETE,
              message: "Reusing existing generated image",
            });
            return { success: true, imageId: existing.id, reused: true };
          }
        }

        await progress.report({
          progress: PROGRESS_STEPS.PROCESS,
          message: "Rendering source image",
        });

        const attachment = await runtime.attachments.resolve({
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

        await progress.report({
          progress: PROGRESS_STEPS.GENERATE,
          message: "Creating image entity",
        });

        // Derive the data-URL format from the attachment's declared mime type
        // rather than hardcoding "png", so it stays correct if providers ever
        // emit another image format.
        const imageFormat = attachment.mimeType.split("/")[1] ?? "png";
        const entityData = createImageEntity({
          dataUrl: createDataUrl(
            bufferView(attachment.data).toString("base64"),
            imageFormat,
          ),
          title: data.imageId,
          status: "draft",
          sourceEntityType: data.sourceEntityType,
          sourceEntityId: data.sourceEntityId,
          attachmentType: data.attachmentType,
          ...(data.dedupKey && { dedupKey: data.dedupKey }),
        });
        await saveProcessedImage(entities, image(), data.imageId, entityData);

        await updateTarget(runtime, data, data.imageId);

        await progress.report({
          progress: PROGRESS_STEPS.COMPLETE,
          message: "Image render complete",
        });

        return { success: true, imageId: data.imageId, reused: false };
      } catch (error) {
        runtime.logger.error("Source image render job failed", {
          error: getErrorMessage(error),
        });
        await failPendingImage(
          entities,
          image(),
          data.imageId,
          getErrorMessage(error),
        );
        return JobResult.failure(error);
      }
    },
  });
}
