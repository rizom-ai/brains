import { z } from "@brains/utils";

/**
 * Deck metadata schema
 * Key fields stored in metadata for fast queries and URL generation
 */
export const deckMetadataSchema = z.object({
  slug: z.string(), // Generated from title if not provided, used for URLs
  title: z.string(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().datetime().optional(),
});

export type DeckMetadata = z.infer<typeof deckMetadataSchema>;

/**
 * Deck entity schema
 * Represents a presentation deck stored as markdown with slide separators
 */
export const deckSchema = z.object({
  id: z.string(),
  entityType: z.literal("deck"),
  content: z.string().describe("Markdown content with slide separators (---)"),
  contentHash: z
    .string()
    .describe("SHA256 hash of content for change detection"),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  metadata: deckMetadataSchema,

  // Frontmatter fields
  title: z.string().describe("Presentation title"),
  description: z.string().optional().describe("Brief description"),
  author: z.string().optional().describe("Author name"),
  status: z.enum(["draft", "published"]).describe("Publication status"),
  publishedAt: z
    .string()
    .datetime()
    .optional()
    .describe("Date when presentation was published"),
  event: z.string().optional().describe("Event where presentation was given"),
});

export type DeckEntity = z.infer<typeof deckSchema>;

/**
 * Enriched deck schema (used for validation)
 * url, typeLabel, listUrl, listLabel are optional to allow validation before enrichment
 */
export const enrichedDeckSchema = deckSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
});

/**
 * Enriched deck type (used by components)
 * All enrichment fields are required - always present after enrichment
 */
export type EnrichedDeck = Omit<
  z.infer<typeof enrichedDeckSchema>,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};
