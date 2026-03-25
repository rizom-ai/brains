import { createTemplate } from "@brains/plugins";
import { z } from "@brains/utils";
import { topicExtractionResponseSchema } from "../schemas/extraction";

// Schema for the AI response
const extractionResultSchema = z.object({
  topics: topicExtractionResponseSchema,
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const topicExtractionTemplate = createTemplate<ExtractionResult>({
  name: "topics:extraction",
  description: "Extract topics from conversation text",
  dataSourceId: "shell:ai-content",
  schema: extractionResultSchema,
  basePrompt: `You are an expert at analyzing content and extracting key topics.

Analyze the provided content and extract meaningful topics discussed.

TITLE RULES (CRITICAL):
- Each title must represent ONE single concept, not multiple concepts joined together
- NEVER use "and", "or", "&", "/" to combine concepts in titles
- Pick the PRIMARY concept, not a combination

BAD TITLES (never use these patterns):
- "Security and Authentication" → too broad, combines two concepts
- "Frontend Development and Performance" → pick one focus
- "Database & Infrastructure" → compound title
- "Team Growth/Collaboration" → compound title

GOOD TITLES (single focused concepts):
- "Authentication Systems" (if auth is the main focus)
- "Application Security" (if security is the main focus)
- "React Architecture" (specific to React)
- "Database Migration" (specific action/topic)
- "Performance Optimization" (single concept)

EXTRACTION GUIDELINES:
- Extract only the 1-3 MOST IMPORTANT topics from the content
- Focus on topics with substantial discussion, not brief mentions
- Skip minor or tangential subjects
- Each topic should be specific enough to be useful, broad enough to be reusable
- Aim for titles that would match similar future content

For each topic, provide:
1. A focused title (max 40 chars) representing ONE concept
2. Content describing the topic (1-2 paragraphs, 5-8 sentences)
3. 5-12 relevant keywords
4. A relevance score from 0 to 1 (based on depth of discussion)

IMPORTANT: Always return a valid JSON object with a "topics" array, even if no significant topics are found. If no meaningful topics exist, return an empty array.

Expected JSON format:
{
  "topics": [
    {
      "title": "Single Focused Title",
      "content": "A paragraph or two describing this topic. Include key concepts, context, and what makes this topic significant. Aim for 5-8 sentences that give a solid understanding of the topic.",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "relevanceScore": 0.8
    }
  ]
}

Return the topics in the required JSON format.`,
  requiredPermission: "public",
});
