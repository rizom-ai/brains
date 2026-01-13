import type {
  PluginTool,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils";
import { noteAdapter } from "../adapters/note-adapter";

/**
 * Input schema for note_create tool
 */
export const createInputSchema = z.object({
  title: z.string().describe("Title for the note"),
  content: z.string().describe("Markdown content/body of the note"),
});

export type CreateInput = z.infer<typeof createInputSchema>;

/**
 * Input schema for note_generate tool
 */
export const generateInputSchema = z.object({
  prompt: z.string().describe("Topic or prompt for AI to generate note from"),
  title: z
    .string()
    .optional()
    .describe("Note title (will be AI-generated if not provided)"),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

/**
 * Create note plugin tools
 */
export function createNoteTools(
  pluginId: string,
  context: ServicePluginContext,
): PluginTool[] {
  return [
    // note_create - Quick capture tool
    createTool(
      pluginId,
      "create",
      "Create a new note for personal knowledge capture. Use when users want to save ideas, research, or reference material.",
      createInputSchema.shape,
      async (input: unknown) => {
        try {
          const parsed = createInputSchema.parse(input);

          // Create markdown content with frontmatter
          const noteContent = noteAdapter.createNoteContent(
            parsed.title,
            parsed.content,
          );

          // Create entity
          const result = await context.entityService.createEntity({
            id: parsed.title,
            entityType: "note",
            content: noteContent,
            metadata: {
              title: parsed.title,
            },
          });

          return {
            success: true,
            data: {
              entityId: result.entityId,
              title: parsed.title,
            },
            message: `Note "${parsed.title}" created successfully`,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: msg,
          };
        }
      },
    ),

    // note_generate - AI-powered generation tool
    createTool(
      pluginId,
      "generate",
      "Queue a job to create a note using AI generation. Use for research notes, summaries, or expanding rough ideas.",
      generateInputSchema.shape,
      async (input: unknown, toolContext: ToolContext) => {
        try {
          const parsed = generateInputSchema.parse(input);

          // Enqueue the note generation job
          const jobId = await context.jobs.enqueue(
            "generation",
            parsed,
            toolContext,
            {
              source: `${pluginId}_generate`,
              metadata: {
                operationType: "content_operations",
                operationTarget: "note",
              },
            },
          );

          return {
            success: true,
            data: { jobId },
            message: `Note generation job queued (jobId: ${jobId})`,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: msg,
          };
        }
      },
    ),
  ];
}
