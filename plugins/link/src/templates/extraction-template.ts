import { createTemplate } from "@brains/plugins";
import { z } from "@brains/utils";

// Schema for the AI response
const linkExtractionSchema = z.object({
  title: z.string().describe("The page title"),
  description: z.string().describe("A one-sentence description"),
  summary: z.string().describe("A 2-3 paragraph summary"),
  content: z.string().describe("The main content in markdown format"),
  keywords: z.array(z.string()).describe("3-5 relevant keywords"),
});

export type LinkExtractionResult = z.infer<typeof linkExtractionSchema>;

export const linkExtractionTemplate = createTemplate<LinkExtractionResult>({
  name: "link:extraction",
  description: "Extract structured content from a web page",
  dataSourceId: "shell:ai-content",
  schema: linkExtractionSchema,
  basePrompt: `You are an expert at extracting and structuring web content.

Analyze the provided webpage and extract the key information.

For the extracted content, provide:
1. A clear, descriptive title for the page
2. A one-sentence description of what the page is about
3. A 2-3 paragraph summary of the main content
4. The main content extracted and formatted as clean markdown (maximum 5000 characters)
5. 3-5 relevant keywords that categorize this content

Format the content section as proper markdown with:
- Headers for main sections
- Bullet points for lists
- Code blocks where appropriate
- Clean, readable formatting

Expected JSON format:
{
  "title": "Clear descriptive title",
  "description": "One sentence describing the page",
  "summary": "2-3 paragraph overview of the content",
  "content": "# Main Content\\n\\nFormatted markdown content here...",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

Return the extracted information in the required JSON format.`,
  requiredPermission: "public",
});
