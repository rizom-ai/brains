import { createTemplate } from "@brains/plugins";
import { z } from "@brains/utils";

// Schema for the AI response
const linkExtractionSchema = z.object({
  title: z.string().describe("The page title"),
  description: z.string().describe("A one-sentence description"),
  summary: z.string().describe("A 1-2 paragraph summary"),
  keywords: z.array(z.string()).describe("3-5 relevant keywords"),
});

export type LinkExtractionResult = z.infer<typeof linkExtractionSchema>;

export const linkExtractionTemplate = createTemplate<LinkExtractionResult>({
  name: "link:extraction",
  description: "Extract structured content from a web page",
  dataSourceId: "shell:ai-content",
  schema: linkExtractionSchema,
  basePrompt: `You are an expert at extracting key information from web search results.

Based on the web search information available, extract:

1. A clear, descriptive title for the page
2. A one-sentence description of what the page is about  
3. A 1-2 paragraph summary of the main topic
4. 3-5 relevant keywords that categorize this content

Focus only on information you can confidently extract from the search results.
Do not make up or hallucinate content that isn't available.

Expected JSON format:
{
  "title": "Clear descriptive title",
  "description": "One sentence describing the page",
  "summary": "1-2 paragraph summary",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

Return the extracted information in the required JSON format.`,
  requiredPermission: "public",
});
