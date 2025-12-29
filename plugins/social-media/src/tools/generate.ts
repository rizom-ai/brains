import type {
  PluginTool,
  ToolResponse,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
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
    .default(true)
    .describe("Add post to publish queue after creation"),
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
  return {
    name: `${pluginId}_generate`,
    description:
      "Generate a new social media post from a prompt, source content, or direct text",
    inputSchema: generateInputSchema.shape,
    visibility: "anchor",
    handler: async (
      input: unknown,
      toolContext: ToolContext,
    ): Promise<ToolResponse> => {
      try {
        const parsed = generateInputSchema.parse(input);

        // Validate input: need at least one of prompt, sourceEntityId, or content
        if (!parsed.prompt && !parsed.sourceEntityId && !parsed.content) {
          return {
            success: false,
            error:
              "At least one of 'prompt', 'sourceEntityId', or 'content' must be provided",
            formatted:
              "_Error: Provide a prompt, source entity, or direct content_",
          };
        }

        // If sourceEntityId is provided, sourceEntityType is required
        if (parsed.sourceEntityId && !parsed.sourceEntityType) {
          return {
            success: false,
            error:
              "'sourceEntityType' is required when 'sourceEntityId' is provided",
            formatted:
              "_Error: Specify sourceEntityType (post or deck) with sourceEntityId_",
          };
        }

        // Enqueue the generation job
        const jobId = await context.enqueueJob(
          "generation",
          parsed,
          toolContext,
          {
            source: `${pluginId}_generate`,
            metadata: {
              operationType: "content_operations",
              operationTarget: "social-post",
            },
          },
        );

        const formatted = formatAsEntity(
          {
            jobId,
            platform: parsed.platform,
            status: "queued",
            addToQueue: parsed.addToQueue,
          },
          { title: "Social Post Generation" },
        );

        return {
          success: true,
          data: { jobId },
          message: `Social post generation job queued (jobId: ${jobId})`,
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
          formatted: `_Error: ${msg}_`,
        };
      }
    },
  };
}
