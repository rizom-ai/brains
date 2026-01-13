import type {
  PluginTool,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils";

/**
 * Input schema for deck:generate tool
 */
export const generateInputSchema = z.object({
  prompt: z
    .string()
    .optional()
    .describe(
      "Topic or prompt for AI to generate slide deck content from (uses default prompt if not provided)",
    ),
  title: z
    .string()
    .optional()
    .describe("Deck title (will be AI-generated if not provided)"),
  content: z
    .string()
    .optional()
    .describe(
      "Slide content in markdown format with slide separators (---). Will be AI-generated if not provided.",
    ),
  description: z
    .string()
    .optional()
    .describe("Brief description (will be auto-generated if not provided)"),
  author: z.string().optional().describe("Author name"),
  event: z
    .string()
    .optional()
    .describe("Event where presentation will be given"),
  skipAi: z
    .boolean()
    .optional()
    .describe(
      "Skip AI generation and create a skeleton deck with placeholders (requires title)",
    ),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

/**
 * Create the deck:generate tool
 */
export function createGenerateTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return createTool(
    pluginId,
    "generate",
    "Queue a job to create a new slide deck draft (provide title and content, or just a prompt for AI generation)",
    generateInputSchema.shape,
    async (input: unknown, toolContext: ToolContext) => {
      try {
        const parsed = generateInputSchema.parse(input);

        // Enqueue the deck generation job
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
              operationTarget: "deck",
            },
          },
        );

        return {
          success: true,
          data: { jobId },
          message: `Deck generation job queued (jobId: ${jobId})`,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
        };
      }
    },
  );
}
