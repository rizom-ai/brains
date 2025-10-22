import { z } from "@brains/utils";

/**
 * Schema for presentation content
 * Simple schema that just requires markdown with slide separators (---)
 */
export const PresentationContentSchema = z.object({
  markdown: z.string().describe("Markdown content with slide separators (---)"),
});

export type PresentationContent = z.infer<typeof PresentationContentSchema>;
