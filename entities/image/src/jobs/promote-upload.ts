import { JobResult, defineJobContract } from "@brains/contracts";
import { createImageEntity, type imageMetadataSchema } from "@brains/image";
import type {
  EntityDefinition,
  EntityJobDeclaration,
} from "@brains/sdk/entities";
import {
  contractJob,
  entityRuntime,
} from "@brains/sdk/internal/entity-runtime";
import { toDataUrl } from "@brains/utils/bytes";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { failPendingImage, saveProcessedImage } from "../lib/processed-image";
import {
  getUploadImageIdentity,
  isSupportedImageMediaType,
} from "../lib/upload-promotion";

type ImageDefinition = EntityDefinition<"image", typeof imageMetadataSchema>;

export const uploadPromotionJobSchema: z.ZodObject<{
  uploadId: z.ZodString;
  imageId: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
}> = z.object({
  uploadId: z.string().min(1),
  imageId: z.string().min(1).optional(),
  title: z.string().optional(),
});

export type UploadPromotionJobData = z.output<typeof uploadPromotionJobSchema>;

/** Image's own job: an uploaded image promoted to an image entity. */
export const uploadPromotionJobContract: ReturnType<
  typeof defineJobContract<typeof uploadPromotionJobSchema>
> = defineJobContract({
  type: "image:upload-promote",
  input: uploadPromotionJobSchema,
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

/**
 * An uploaded image read from the shared upload store and saved over the
 * pending placeholder its create wrote.
 */
export function promoteUploadJob(
  image: () => ImageDefinition,
): EntityJobDeclaration<typeof uploadPromotionJobSchema> {
  return contractJob(uploadPromotionJobContract, {
    handle: async (context): Promise<UploadPromotionJobResult> => {
      const data: UploadPromotionJobData = context.input;
      const { entities, progress } = context;
      const runtime = entityRuntime(context);
      try {
        await progress.report({
          progress: 10,
          message: "Reading uploaded image",
        });

        const upload = await runtime.uploads.read(data.uploadId);

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

        await progress.report({
          progress: 60,
          message: "Saving uploaded image",
        });

        const imageEntity = createImageEntity({
          dataUrl: toDataUrl(upload.record.mediaType, upload.content),
          title: identity.title,
          status: "draft",
          sourceUploadId: data.uploadId,
          sourceFilename: upload.record.filename,
          sourceMediaType: upload.record.mediaType,
          attachmentType: "uploaded",
        });
        await saveProcessedImage(entities, image(), imageId, imageEntity);

        await progress.report({
          progress: 100,
          message: "Uploaded image promoted",
        });

        return { entityId: imageId, status: "created" };
      } catch (error) {
        if (data.imageId) {
          await failPendingImage(
            entities,
            image(),
            data.imageId,
            getErrorMessage(error),
          );
        }
        return JobResult.failure(error);
      }
    },
  });
}
