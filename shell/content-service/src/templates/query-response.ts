import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";

export const queryResponseSourceSchema: z.ZodObject<{
  type: z.ZodString;
  title: z.ZodString;
  relevance: z.ZodNumber;
}> = z.object({
  type: z.string().describe("Type of source (e.g., note, article)"),
  title: z.string().describe("Title or identifier of the source"),
  relevance: z.number().min(0).max(1).describe("Relevance score"),
});

export type QueryResponseSource = z.output<typeof queryResponseSourceSchema>;

/**
 * Schema for public query responses
 * Provides a safe, structured format for public tool responses
 */
export const queryResponseSchema: z.ZodObject<{
  answer: z.ZodString;
  sources: z.ZodOptional<z.ZodArray<typeof queryResponseSourceSchema>>;
  confidence: z.ZodOptional<
    z.ZodEnum<{ high: "high"; medium: "medium"; low: "low" }>
  >;
  suggestions: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  answer: z.string().describe("The answer to the user's query"),
  sources: z
    .array(queryResponseSourceSchema)
    .optional()
    .describe("Sources used to generate the answer"),
  confidence: z
    .enum(["high", "medium", "low"])
    .optional()
    .describe("Confidence level of the answer"),
  suggestions: z
    .array(z.string())
    .optional()
    .describe("Related topics or follow-up questions"),
});

export type QueryResponse = z.output<typeof queryResponseSchema>;

/**
 * Template for public query responses
 * Used to ensure consistent, safe responses for public users
 */
export const queryResponseTemplate: Template = {
  name: "shell:query_response",
  description: "Template for structured query responses for public users",
  schema: queryResponseSchema,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  useKnowledgeContext: true,
  basePrompt: `You are a helpful assistant providing information from a knowledge base.

Generate a clear, informative response to the user's query based on the available context.

Guidelines:
- Provide accurate, factual information based on the sources
- Be concise but comprehensive
- Indicate confidence level based on source quality and relevance
- Suggest related topics if appropriate
- Do not include any private or sensitive information
- Focus on publicly shareable knowledge

Format the response in a user-friendly way that directly answers their question.`,
};
