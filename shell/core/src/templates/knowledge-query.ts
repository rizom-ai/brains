import type { Template } from "@brains/templates";
import { defaultQueryResponseSchema } from "@brains/plugins";
import { DefaultQueryResponseFormatter } from "@brains/utils";

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
1. Search through available entities for relevant information
2. Provide accurate, contextual responses based on the data
3. If information is missing, clearly state what additional data might be helpful
4. Structure your response clearly and concisely`,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  schema: defaultQueryResponseSchema,
  formatter: new DefaultQueryResponseFormatter(),
};
