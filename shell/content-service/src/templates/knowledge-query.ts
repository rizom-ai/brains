import type { Template } from "@brains/templates";
import {
  defaultQueryResponseSchema,
  DefaultQueryResponseFormatter,
} from "@brains/utils";

/**
 * Knowledge query template for shell queries
 * Uses entity-aware search to provide contextual responses
 */
export const knowledgeQueryTemplate: Template = {
  name: "shell:knowledge-query",
  description: "Knowledge-aware query processing with entity search",
  basePrompt: `You are a personal knowledge assistant with access to the user's entities and data.
Analyze the user's query and provide a helpful response based on available information.

Instructions:
1. Use the conversation history if provided to maintain context and continuity
2. Search through available entities for relevant information
3. Provide accurate, contextual responses based on the data
4. If information is missing, clearly state what additional data might be helpful
5. Structure your response clearly and concisely`,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  schema: defaultQueryResponseSchema,
  formatter: new DefaultQueryResponseFormatter(),
};
