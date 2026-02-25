import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { BaseJobHandler } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import {
  getErrorMessage,
  z,
  slugify,
  setCoverImageId,
  PROGRESS_STEPS,
  JobResult,
} from "@brains/utils";
import { imageAdapter } from "@brains/image";

/**
 * Schema for AI-distilled image prompt
 */
const imagePromptSchema = z.object({
  imagePrompt: z
    .string()
    .describe(
      "A concise, vivid image prompt capturing the core visual concept",
    ),
});

/**
 * Schema for image generation job data
 */
export const imageGenerationJobDataSchema = z.object({
  /** Text prompt for image generation (used directly when provided without entityContent) */
  prompt: z.string(),
  /** Title for the generated image (used to generate ID) */
  title: z.string(),
  /** Aspect ratio for the generated image */
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
  /** Target entity type to update with coverImageId (optional) */
  targetEntityType: z.string().optional(),
  /** Target entity ID to update with coverImageId (required if targetEntityType is set) */
  targetEntityId: z.string().optional(),
  /** Entity title for AI prompt distillation (optional) */
  entityTitle: z.string().optional(),
  /** Entity content for AI prompt distillation (optional, triggers AI prompt generation) */
  entityContent: z.string().optional(),
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

      // Step 1.5: Distill prompt using AI when entity content is provided
      let finalPrompt = prompt;
      if (data.entityContent) {
        await this.reportProgress(progressReporter, {
          progress: PROGRESS_STEPS.FETCH,
          message: "Distilling image prompt from content",
        });

        try {
          const { object } = await this.context.ai.generateObject(
            `You are an editorial illustration art director for a design magazine. Given an article, describe WHAT TO DEPICT — not how to render it. The rendering style is already defined separately.

Rules:
- NEVER depict the topic literally (no laptops for tech, no books for education, no globes for international topics)
- Find a single strong visual METAPHOR using everyday physical objects in unexpected arrangements
- Describe ONLY the objects and their spatial relationships — no style, no colors, no lighting, no materials, no rendering instructions
- Keep it to 1-2 sentences describing the scene
- Think conceptual, like a New Yorker cover illustration concept

Example good output: "A giant pair of scissors cutting through a tangled ball of red tape, with tiny office workers climbing the loose strands like ropes"
Example bad output: "A dreamlike crystal formation glowing with ethereal light in soft watercolor tones"

Title: "${data.entityTitle ?? title}"

Content:
${data.entityContent}`,
            imagePromptSchema,
          );
          finalPrompt = prompt + object.imagePrompt;
        } catch (error) {
          this.logger.warn("AI prompt distillation failed, using fallback", {
            error: getErrorMessage(error),
          });
          // Fall back to using the raw prompt
        }
      }

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.PROCESS,
        message: "Generating image",
      });

      // Step 2: Generate image
      let generationResult;
      try {
        generationResult = await this.context.ai.generateImage(finalPrompt, {
          ...(aspectRatio && { aspectRatio }),
        });
      } catch (error) {
        this.logger.error("Image generation failed", {
          jobId,
          error: getErrorMessage(error),
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
        error: getErrorMessage(error),
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
