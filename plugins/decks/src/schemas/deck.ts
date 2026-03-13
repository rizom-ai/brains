import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

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
  status: deckStatusSchema,
  publishedAt: z.string().datetime().optional(),
  event: z.string().optional(),
  coverImageId: z.string().optional(), // References an image entity by ID
});

export type DeckFrontmatter = z.infer<typeof deckFrontmatterSchema>;

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
  });

export type DeckMetadata = z.infer<typeof deckMetadataSchema>;

/**
 * Deck entity schema (extends BaseEntity)
 * Content field contains markdown with frontmatter + slide content
 * Metadata field duplicates key fields from frontmatter for fast queries
 */
export const deckSchema = baseEntitySchema.extend({
  entityType: z.literal("deck"),
  metadata: deckMetadataSchema,
});

export type DeckEntity = z.infer<typeof deckSchema>;

/**
 * Deck with parsed frontmatter data (returned by datasource)
 * Extends DeckEntity with parsed frontmatter and body (markdown without frontmatter)
 */
export const deckWithDataSchema = deckSchema.extend({
  frontmatter: deckFrontmatterSchema,
  body: z.string(),
});

export type DeckWithData = z.infer<typeof deckWithDataSchema>;

/**
 * Enriched deck schema (used for validation)
 * url, typeLabel, listUrl, listLabel are optional to allow validation before enrichment
 */
export const enrichedDeckSchema = deckWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
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
