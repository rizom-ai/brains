import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { BaseJobHandler } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import {
  z,
  slugify,
  setCoverImageId,
  PROGRESS_STEPS,
  JobResult,
} from "@brains/utils";
import { imageAdapter } from "@brains/image";

/**
 * Schema for image generation job data
 */
export const imageGenerationJobDataSchema = z.object({
  /** Text prompt for image generation */
  prompt: z.string(),
  /** Title for the generated image (used to generate ID) */
  title: z.string(),
  /** Aspect ratio for the generated image */
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
  /** Target entity type to update with coverImageId (optional) */
  targetEntityType: z.string().optional(),
  /** Target entity ID to update with coverImageId (required if targetEntityType is set) */
  targetEntityId: z.string().optional(),
});

export type ImageGenerationJobData = z.infer<
  typeof imageGenerationJobDataSchema
>;

interface ImageGenerationResult {
  success: boolean;
  imageId?: string;
  error?: string;
}

/**
 * Job handler for AI image generation
 *
 * This runs asynchronously so tool calls aren't blocked by image API latency.
 * The handler:
 * 1. Checks if image generation is available
 * 2. Generates image via AI service
 * 3. Creates image entity from generated data
 * 4. Optionally updates target entity's coverImageId
 */
export class ImageGenerationJobHandler extends BaseJobHandler<
  "image-generate",
  ImageGenerationJobData,
  ImageGenerationResult
> {
  private readonly context: ServicePluginContext;

  constructor(context: ServicePluginContext, logger: Logger) {
    super(logger, {
      schema: imageGenerationJobDataSchema,
      jobTypeName: "image-generate",
    });
    this.context = context;
  }

  async process(
    data: ImageGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ImageGenerationResult> {
    const { prompt, title, aspectRatio, targetEntityType, targetEntityId } =
      data;

    this.logger.debug("Starting image generation job", {
      jobId,
      title,
      hasTarget: !!targetEntityType,
    });

    try {
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.INIT,
        message: "Checking image generation availability",
      });

      // Step 1: Check if image generation is available
      if (!this.context.ai.canGenerateImages()) {
        return JobResult.failure(
          new Error("Image generation not available: no API key configured"),
        );
      }

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.PROCESS,
        message: "Generating image",
      });

      // Step 2: Generate image
      let generationResult;
      try {
        generationResult = await this.context.ai.generateImage(prompt, {
          ...(aspectRatio && { aspectRatio }),
        });
      } catch (error) {
        this.logger.error("Image generation failed", {
          jobId,
          error: error instanceof Error ? error.message : String(error),
        });
        return JobResult.failure(error);
      }

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.GENERATE,
        message: "Creating image entity",
      });

      // Step 3: Create image entity
      const imageId = slugify(title);
      const entityData = imageAdapter.createImageEntity({
        dataUrl: generationResult.dataUrl,
        title,
      });

      // Delete existing image if regenerating
      const existingImage = await this.context.entityService.getEntity(
        "image",
        imageId,
      );
      if (existingImage) {
        this.logger.debug("Deleting existing image for regeneration", {
          imageId,
        });
        await this.context.entityService.deleteEntity("image", imageId);
      }

      await this.context.entityService.createEntity({
        ...entityData,
        id: imageId,
      });

      this.logger.debug("Created image entity", { imageId });

      // Step 4: Optionally update target entity
      if (targetEntityType && targetEntityId) {
        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.SAVE,
          message: `Updating ${targetEntityType} with cover image`,
        });

        const targetEntity = await this.context.entityService.getEntity(
          targetEntityType,
          targetEntityId,
        );

        if (!targetEntity) {
          return JobResult.failure(
            new Error(
              `Target entity not found: ${targetEntityType}/${targetEntityId}`,
            ),
          );
        }

        const updated = setCoverImageId(targetEntity, imageId);
        await this.context.entities.update(updated);

        this.logger.debug("Updated target entity with cover image", {
          targetEntityType,
          targetEntityId,
          imageId,
        });
      }

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: "Image generation complete",
      });

      this.logger.info("Image generation job complete", {
        jobId,
        imageId,
        targetEntityType,
        targetEntityId,
      });

      return { success: true, imageId };
    } catch (error) {
      this.logger.error("Image generation job failed", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return JobResult.failure(error);
    }
  }

  protected override summarizeDataForLog(
    data: ImageGenerationJobData,
  ): Record<string, unknown> {
    return {
      title: data.title,
      promptLength: data.prompt.length,
      aspectRatio: data.aspectRatio,
      targetEntityType: data.targetEntityType,
      targetEntityId: data.targetEntityId,
    };
  }
}
