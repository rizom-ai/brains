import { z } from "@brains/utils";

/**
 * RSS feed XML output schema
 */
export const rssFeedOutputSchema = z.object({
  xml: z.string(),
});

export type RSSFeedOutput = z.infer<typeof rssFeedOutputSchema>;
