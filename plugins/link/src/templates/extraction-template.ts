import { createTemplate } from "@brains/plugins";
import { z } from "@brains/utils";

// Schema for the AI response
const linkExtractionSchema = z.object({
  success: z
    .boolean()
    .describe(
      "Set to true if you can extract meaningful content. Set to false only if the provided content is empty, just an error message, or otherwise unusable.",
    ),
  error: z
    .string()
    .optional()
    .describe(
      "If success is false, explain why content could not be extracted",
    ),
  title: z
    .string()
    .describe(
      "The page title - extract from the content or create a descriptive one. Leave empty string if success is false.",
    ),
  description: z
    .string()
    .describe(
      "A one-sentence description of what the page is about. Leave empty string if success is false.",
    ),
  summary: z
    .string()
    .describe(
      "A 1-2 paragraph summary of the main content. Leave empty string if success is false.",
    ),
  keywords: z
    .array(z.string())
    .describe(
      "3-5 relevant keywords that categorize this content. Leave empty array if success is false.",
    ),
});

export type LinkExtractionResult = z.infer<typeof linkExtractionSchema>;

export const linkExtractionTemplate = createTemplate<LinkExtractionResult>({
  name: "link:extraction",
  description: "Extract structured content from webpage markdown",
  dataSourceId: "shell:ai-content",
  schema: linkExtractionSchema,
  basePrompt: `You are an expert at extracting key information from webpage content.

You will receive webpage content in markdown format. Your job is to extract structured information from it.

If the content is empty, contains only an error message, or has no meaningful information to extract, set success to false and explain why.

If the content has meaningful information, set success to true and extract:
1. A clear, descriptive title for the page
2. A one-sentence description of what the page is about
3. A 1-2 paragraph summary of the main content
4. 3-5 relevant keywords that categorize this content

Focus only on information present in the provided content. Do not make up or hallucinate information.`,
  requiredPermission: "public",
});
