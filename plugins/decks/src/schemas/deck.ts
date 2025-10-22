import { z } from "@brains/utils";

/**
 * Deck entity schema
 * Represents a presentation deck stored as markdown with slide separators
 */
export const deckSchema = z.object({
  id: z.string(),
  entityType: z.literal("deck"),
  content: z.string().describe("Markdown content with slide separators (---)"),
  created: z.string().datetime(),
  updated: z.string().datetime(),

  // Frontmatter fields
  title: z.string().describe("Presentation title"),
  description: z.string().optional().describe("Brief description"),
  author: z.string().optional().describe("Author name"),
});

export type DeckEntity = z.infer<typeof deckSchema>;
