import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import { z } from "@brains/utils";
import type { SocialMediaConfig } from "../config";

/**
 * Input schema for social-media:generate tool
 */
export const generateInputSchema = z.object({
  prompt: z
    .string()
    .optional()
    .describe("Prompt for AI to generate social post content"),
  platform: z
    .enum(["linkedin"])
    .default("linkedin")
    .describe("Target social media platform"),
  sourceEntityType: z
    .enum(["post", "deck"])
    .optional()
    .describe("Source entity type to generate post from (blog post or deck)"),
  sourceEntityId: z
    .string()
    .optional()
    .describe("Source entity ID to generate post from"),
  content: z
    .string()
    .optional()
    .describe("Direct content for the post (skips AI generation)"),
  addToQueue: z
    .boolean()
    .default(false)
    .describe("Add post to publish queue after creation"),
  generateImage: z
    .boolean()
    .optional()
    .describe(
      "Auto-generate and attach a cover image for the post in a single step. Use this instead of calling image_generate separately.",
    ),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

/**
 * Create the social-media:generate tool
 */
export function createGenerateTool(
  context: ServicePluginContext,
  _config: SocialMediaConfig,
  pluginId: string,
): PluginTool {
  return createTypedTool(
    pluginId,
    "generate",
    "Generate a new social media post from a prompt, source content, or direct text",
    generateInputSchema,
    async (input, toolContext) => {
      // Validate input: need at least one of prompt, sourceEntityId, or content
      if (!input.prompt && !input.sourceEntityId && !input.content) {
        return {
          success: false,
          error:
            "At least one of 'prompt', 'sourceEntityId', or 'content' must be provided",
        };
      }

      // If sourceEntityId is provided, sourceEntityType is required
      if (input.sourceEntityId && !input.sourceEntityType) {
        return {
          success: false,
          error:
            "'sourceEntityType' is required when 'sourceEntityId' is provided",
        };
      }

      // Enqueue the generation job
      const jobId = await context.jobs.enqueue(
        "generation",
        input,
        toolContext,
        {
          source: `${pluginId}_generate`,
          metadata: {
            operationType: "content_operations",
            operationTarget: "social-post",
          },
        },
      );

      return {
        success: true,
        data: { jobId },
        message: `Social post generation job queued (jobId: ${jobId})`,
      };
    },
  );
}
