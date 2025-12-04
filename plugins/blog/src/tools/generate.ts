import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z, createId } from "@brains/utils";
import type { BlogConfig } from "../config";

/**
 * Input schema for blog:generate tool
 */
export const generateInputSchema = z.object({
  prompt: z
    .string()
    .optional()
    .describe(
      "Topic or prompt for AI to generate blog post content from (uses default prompt if not provided)",
    ),
  title: z
    .string()
    .optional()
    .describe("Blog post title (will be AI-generated if not provided)"),
  content: z
    .string()
    .optional()
    .describe(
      "Blog post content in markdown format (will be AI-generated if not provided)",
    ),
  excerpt: z
    .string()
    .optional()
    .describe("Short excerpt/summary (will be auto-generated if not provided)"),
  coverImage: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

/**
 * Create the blog:generate tool
 */
export function createGenerateTool(
  context: ServicePluginContext,
  _config: BlogConfig,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_generate`,
    description:
      "Queue a job to create a new blog post draft (provide title and content, or just a prompt for AI generation)",
    inputSchema: generateInputSchema.shape,
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const parsed = generateInputSchema.parse(input);

        // Enqueue the blog generation job
        const jobId = await context.enqueueJob("generation", parsed, {
          source: `${pluginId}_generate`,
          metadata: {
            rootJobId: createId(),
            operationType: "content_operations",
            operationTarget: "blog-post",
          },
        });

        return {
          success: true,
          data: { jobId },
          message: `Blog post generation job queued (jobId: ${jobId})`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
