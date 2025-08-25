import { createTemplate } from "@brains/plugins";
import { z } from "zod";
import { topicExtractionResponseSchema } from "../schemas/extraction";

// Schema for the AI response
const extractionResultSchema = z.object({
  topics: topicExtractionResponseSchema,
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const topicExtractionTemplate = createTemplate<ExtractionResult>({
  name: "topics:extraction",
  description: "Extract topics from conversation text",
  schema: extractionResultSchema,
  basePrompt: `You are an expert at analyzing conversations and extracting key topics.

Analyze the provided conversation and extract meaningful topics discussed. 

CRITICAL: Extract only 1-2 broad, comprehensive topics maximum. If multiple aspects of the same subject are discussed, consolidate them into ONE single topic. Do NOT create separate topics for different aspects of the same theme.

Focus on:
- Main themes and subjects covered in the discussion
- Broad conceptual areas that encompass multiple related points
- Important problems, solutions, or decisions discussed
- Group related subtopics under broader themes

CONSOLIDATION EXAMPLES:
- Instead of: "User Authentication", "Login Security", "Password Management" 
- Create: "Authentication and Security Systems"

- Instead of: "React Components", "Component State", "React Hooks"
- Create: "React Development Patterns"

TITLE GUIDELINES:
- Use concise, general titles (avoid company/product names when possible)
- Focus on the broader concept rather than specific implementation
- Examples: "Professional Networks" instead of "Rizom's Professional Network"
- Examples: "Talent Coordination" instead of "How Rizom Coordinates Talent"

For each consolidated topic, provide:
1. A concise, general title (max 50 chars) focusing on the broader concept
2. A comprehensive summary (2-3 sentences) covering all related points
3. The main content as a single text string covering subtopics and details discussed
4. 8-15 relevant keywords covering the full scope of the topic
5. A relevance score from 0 to 1 (higher for consolidated, comprehensive topics)

IMPORTANT: Always return a valid JSON object with a "topics" array, even if no significant topics are found. If no meaningful topics exist, return an empty array.

Expected JSON format:
{
  "topics": [
    {
      "title": "Consolidated Topic Title",
      "summary": "Brief overview covering all related discussion points in this topic area.",
      "content": "Detailed content as a single string covering all subtopics, key points, decisions made, and conclusions reached in this discussion area.",
      "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
      "relevanceScore": 0.8
    }
  ]
}

Return the topics in the required JSON format.`,
  requiredPermission: "public",
});
