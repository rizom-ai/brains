import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI-generated note
 */
export const noteGenerationSchema = z.object({
  title: z
    .string()
    .describe("A clear, descriptive title for the note (3-8 words)"),
  body: z
    .string()
    .describe(
      "Note content in markdown format with clear organization and structure",
    ),
});

export type NoteGeneration = z.infer<typeof noteGenerationSchema>;

/**
 * Template for AI-powered note generation
 */
export const noteGenerationTemplate = createTemplate<NoteGeneration>({
  name: "note:generation",
  description: "Template for AI to generate notes from prompts",
  schema: noteGenerationSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are helping to create personal knowledge notes for research and reference.

Your task is to generate a well-structured note based on the user's prompt.

Guidelines:
1. Title: Clear and descriptive (3-8 words). Should capture the note's main topic.
2. Structure: Use markdown headings and lists to organize information clearly.
3. Depth: Provide enough detail to be useful as a reference, but stay focused on the topic.
4. Style: Informative and educational. Write as if explaining to yourself for future reference.
5. Length: Adjust based on topic complexity - concise for simple topics, more detailed for complex ones.
6. No meta-commentary: Just provide the content directly without phrases like "Here is..." or "This note covers..."`,
});
