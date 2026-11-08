import {
  JobResult,
  PROGRESS_STEPS,
  fetchStyleGuide,
  formatVisualGuidance,
  imageGenerateJobContract,
  type ImageGenerateJobInput,
} from "@brains/contracts";
import { createImageEntity, type imageMetadataSchema } from "@brains/image";
import type {
  EntityDefinition,
  EntityJobDeclaration,
} from "@brains/sdk/entities";
import {
  contractJob,
  entityRuntime,
} from "@brains/sdk/internal/entity-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { buildImageBasePrompt } from "../lib/build-image-base-prompt";
import { getDistillableEntityContent } from "../lib/distillable-content";
import { failPendingImage, saveProcessedImage } from "../lib/processed-image";

type ImageDefinition = EntityDefinition<"image", typeof imageMetadataSchema>;

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

interface ImageGenerationResult {
  success: boolean;
  imageId?: string;
  error?: string;
}

/**
 * AI image generation, queued by image's own routes and by other packages
 * through `image:image-generate`. It runs asynchronously so a create is not
 * blocked by image API latency:
 * 1. Checks if image generation is available
 * 2. Generates the image, in the style guide's visual direction
 * 3. Saves it over its pending placeholder, or as a new image
 * 4. Optionally points the target entity's coverImageId at it
 */
export function generateImageJob(
  image: () => ImageDefinition,
): EntityJobDeclaration<typeof imageGenerateJobContract.input> {
  return contractJob(imageGenerateJobContract, {
    handle: async (context): Promise<ImageGenerationResult> => {
      const data: ImageGenerateJobInput = context.input;
      const { entities, progress } = context;
      const runtime = entityRuntime(context);
      const { prompt, aspectRatio, targetEntityType, targetEntityId } = data;
      const title =
        data.title ??
        (targetEntityId
          ? `cover-${targetEntityId}`
          : prompt.slice(0, 60).trim());
      const imageId = slugify(title);
      runtime.logger.debug("Starting image generation job", {
        title,
        hasTarget: !!targetEntityType,
      });

      try {
        await progress.report({
          progress: PROGRESS_STEPS.INIT,
          message: "Checking image generation availability",
        });

        // Step 1: Check if image generation is available
        if (!runtime.images.canGenerate()) {
          const error = new Error(
            "Image generation not available: no API key configured",
          );
          await failPendingImage(entities, image(), imageId, error.message);
          return JobResult.failure(error);
        }

        const styleGuide = await fetchStyleGuide(runtime.anyEntities);
        const visualGuidance = formatVisualGuidance(styleGuide).trim();

        // Step 1.5: Distill prompt using AI when entity content is provided
        let finalPrompt = prompt;
        const entityContent = getDistillableEntityContent(data.entityContent);
        if (entityContent) {
          await progress.report({
            progress: PROGRESS_STEPS.FETCH,
            message: "Distilling image prompt from content",
          });

          try {
            const object = await runtime.generateObject(
              `You are a visual concept designer. Given source content, describe WHAT TO DEPICT, not how to render it.

Rules:
- Identify one clear visual subject, scene, or metaphor that communicates the central idea
- Avoid generic visual clichés unless they are genuinely central to the source
- Describe only subjects and their spatial relationships; omit colors, lighting, materials, medium, and rendering instructions
- Keep the result to 1-2 sentences
${visualGuidance ? `- Let the supplied visual guidance influence concept selection without repeating rendering instructions\n\nVisual guidance:\n${visualGuidance}\n` : ""}
Title: "${data.entityTitle ?? title}"

Content:
${entityContent}`,
              imagePromptSchema,
            );
            finalPrompt = `${prompt.trim()} ${object.imagePrompt}`;
          } catch (error) {
            // Distillation is an improvement, not a requirement: the raw
            // prompt still describes the image.
            runtime.logger.warn(
              "AI prompt distillation failed, using fallback",
              { error: getErrorMessage(error) },
            );
          }
        }

        await progress.report({
          progress: PROGRESS_STEPS.PROCESS,
          message: "Generating image",
        });

        // Step 2: Apply style-guide visual direction
        const styledPrompt = buildImageBasePrompt(styleGuide) + finalPrompt;

        // Step 3: Generate image
        let generationResult;
        try {
          generationResult = await runtime.images.generate(styledPrompt, {
            ...(aspectRatio && { aspectRatio }),
          });
        } catch (error) {
          runtime.logger.error("Image generation failed", {
            error: getErrorMessage(error),
          });
          return JobResult.failure(error);
        }

        await progress.report({
          progress: PROGRESS_STEPS.GENERATE,
          message: "Creating image entity",
        });

        // Step 3: Create or update image entity
        const entityData = createImageEntity({
          dataUrl: generationResult.dataUrl,
          title,
          status: "draft",
          attachmentType: "generated",
          ...(targetEntityType && { sourceEntityType: targetEntityType }),
          ...(targetEntityId && { sourceEntityId: targetEntityId }),
        });
        await saveProcessedImage(entities, image(), imageId, entityData);
        runtime.logger.debug("Created image entity", { imageId });

        // Step 4: Optionally update target entity
        if (targetEntityType && targetEntityId) {
          await progress.report({
            progress: PROGRESS_STEPS.SAVE,
            message: `Updating ${targetEntityType} with cover image`,
          });

          const targetEntity = await runtime.anyEntities.find(
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

          await runtime.linkInto(imageId, {
            entityType: targetEntityType,
            entityId: targetEntity.id,
            field: "coverImageId",
          });
          runtime.logger.debug("Updated target entity with cover image", {
            targetEntityType,
            targetEntityId,
            imageId,
          });
        }

        await progress.report({
          progress: PROGRESS_STEPS.COMPLETE,
          message: "Image generation complete",
        });

        runtime.logger.info("Image generation job complete", {
          imageId,
          targetEntityType,
          targetEntityId,
        });
        return { success: true, imageId };
      } catch (error) {
        runtime.logger.error("Image generation job failed", {
          error: getErrorMessage(error),
        });
        await failPendingImage(
          entities,
          image(),
          imageId,
          getErrorMessage(error),
        );
        return JobResult.failure(error);
      }
    },
  });
}
