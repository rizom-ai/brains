import type { Template } from "@brains/plugins";
import { z } from "zod";
import { topicExtractionResponseSchema } from "../schemas/extraction";

// Schema for the AI response
const extractionResultSchema = z.object({
  topics: topicExtractionResponseSchema,
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const topicExtractionTemplate: Template<ExtractionResult> = {
  name: "topics:extraction",
  description: "Extract topics from conversation text",
  schema: extractionResultSchema,
  basePrompt: `You are an expert at analyzing conversations and extracting key topics.

Analyze the provided conversation and extract the main topics discussed.

For each topic, provide:
1. A clear, concise title (max 100 chars)
2. A brief summary (2-3 sentences)
3. The main content points discussed
4. 5-10 relevant keywords
5. A relevance score from 0 to 1 (based on depth of discussion, importance, and actionability)

Return the topics in the required JSON format with a 'topics' array containing the extracted topics.`,
  requiredPermission: "public",
};
