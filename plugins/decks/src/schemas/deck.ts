import { z } from "@brains/utils";

/**
 * Deck status
 */
export const deckStatusSchema = z.enum(["draft", "queued", "published"]);
export type DeckStatus = z.infer<typeof deckStatusSchema>;

/**
 * Deck frontmatter schema (stored in content as YAML frontmatter)
 * Contains all presentation data for human editing
 */
export const deckFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(), // Auto-generated from title if not provided
  description: z.string().optional(),
  author: z.string().optional(),
  status: deckStatusSchema.default("draft"),
  publishedAt: z.string().datetime().optional(),
  event: z.string().optional(),
  coverImageId: z.string().optional(), // References an image entity by ID
});

/**
 * Deck metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
export const deckMetadataSchema = deckFrontmatterSchema
  .pick({
    title: true,
    status: true,
    publishedAt: true,
    coverImageId: true,
  })
  .extend({
    slug: z.string(), // Required in metadata (auto-generated from title)
    status: deckStatusSchema, // Override to remove .default() from frontmatter
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
  status: deckStatusSchema.describe("Publication status"),
  publishedAt: z
    .string()
    .datetime()
    .optional()
    .describe("Date when presentation was published"),
  event: z.string().optional().describe("Event where presentation was given"),
  coverImageId: z
    .string()
    .optional()
    .describe("ID of an image entity to use as cover image"),
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
