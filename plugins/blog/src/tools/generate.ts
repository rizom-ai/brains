import type {
  PluginTool,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
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
  coverImageId: z
    .string()
    .optional()
    .describe("ID of an image entity to use as cover image"),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
  skipAi: z
    .boolean()
    .optional()
    .describe(
      "Skip AI generation and create a skeleton blog post with placeholders (requires title)",
    ),
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
  return createTool(
    pluginId,
    "generate",
    "Queue a job to create a new blog post draft (provide title and content, or just a prompt for AI generation)",
    generateInputSchema.shape,
    async (input: unknown, toolContext: ToolContext) => {
      try {
        const parsed = generateInputSchema.parse(input);

        // Enqueue the blog generation job
        // Note: Don't set rootJobId - let the job queue service default it to the job's own ID
        // Setting a different rootJobId would cause progress events to be skipped
        const jobId = await context.jobs.enqueue(
          "generation",
          parsed,
          toolContext,
          {
            source: `${pluginId}_generate`,
            metadata: {
              operationType: "content_operations",
              operationTarget: "blog-post",
            },
          },
        );

        const formatted = formatAsEntity(
          {
            jobId,
            title: parsed.title ?? "(AI generated)",
            status: "queued",
          },
          { title: "Blog Post Generation" },
        );

        return {
          success: true,
          data: { jobId },
          message: `Blog post generation job queued (jobId: ${jobId})`,
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
  );
}
