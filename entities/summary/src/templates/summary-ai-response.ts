import { z } from "@brains/utils";
import { createTemplate } from "@brains/plugins";

/**
 * Schema for AI response when analyzing digests
 */
export const summaryAiResponseSchema = z.object({
  action: z
    .enum(["update", "new"])
    .describe("Whether to update existing or create new entry"),
  index: z
    .number()
    .optional()
    .describe("Index of entry to update (0 for most recent)"),
  title: z.string().describe("Brief topic or phase description"),
  summary: z
    .string()
    .describe("Natural summary paragraph with key points and decisions"),
});

export type SummaryAiResponse = z.infer<typeof summaryAiResponseSchema>;

/**
 * Template for AI-powered summary generation
 */
export const summaryAiResponseTemplate = createTemplate<SummaryAiResponse>({
  name: "summary:ai-response",
  description:
    "Template for AI to analyze conversation digests and create summaries",
  schema: summaryAiResponseSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  basePrompt: `You are a helpful assistant that analyzes conversations and creates concise summaries.

Your task is to:
1. Determine if the new messages continue an existing topic or introduce a new one
2. Generate a clear, natural summary that captures key points, decisions, and action items
3. Return structured data in the required JSON format

Be concise but comprehensive, focusing on the most important information.`,
});
