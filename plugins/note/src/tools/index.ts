import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
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
    createTypedTool(
      pluginId,
      "create",
      "Create a new note for personal knowledge capture. Use when users want to save ideas, research, or reference material.",
      createInputSchema,
      async (input) => {
        // Create markdown content with frontmatter
        const noteContent = noteAdapter.createNoteContent(
          input.title,
          input.content,
        );

        // Create entity
        const result = await context.entityService.createEntity({
          id: input.title,
          entityType: "base",
          content: noteContent,
          metadata: {
            title: input.title,
          },
        });

        return {
          success: true,
          data: {
            entityId: result.entityId,
            title: input.title,
          },
          message: `Note "${input.title}" created successfully`,
        };
      },
    ),

    // note_generate - AI-powered generation tool
    createTypedTool(
      pluginId,
      "generate",
      "Queue a job to create a note using AI generation. Use for research notes, summaries, or expanding rough ideas.",
      generateInputSchema,
      async (input, toolContext) => {
        // Enqueue the note generation job
        const jobId = await context.jobs.enqueue(
          "generation",
          input,
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
      },
    ),
  ];
}
