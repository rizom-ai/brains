import { z } from "@brains/utils/zod-v4";

const deckStatusSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);

const deckFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  status: deckStatusSchema,
  publishedAt: z.string().optional(),
  event: z.string().optional(),
  coverImageId: z.string().optional(),
  ogImageId: z.string().optional(),
});

const deckMetadataSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: deckStatusSchema,
  publishedAt: z.string().optional(),
  coverImageId: z.string().optional(),
  slug: z.string(),
  error: z.string().optional(),
});

export const deckWithDataSchema = z.object({
  id: z.string(),
  entityType: z.literal("deck"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: z.enum(["public", "shared", "restricted"]),
  metadata: deckMetadataSchema,
  contentHash: z.string(),
  frontmatter: deckFrontmatterSchema,
  body: z.string(),
  ogImageUrl: z.string().optional(),
});

export const enrichedDeckSchema = deckWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

// Schema for deck list page data (non-enriched, returned by datasource)
export const deckListSchema = z.object({
  decks: z.array(deckWithDataSchema),
});

// Schema for enriched deck list page data (used by template)
export const enrichedDeckListSchema = z.object({
  decks: z.array(enrichedDeckSchema),
  pageTitle: z.string().optional(),
  pageLabel: z.string().optional(),
});

export type DeckListData = z.output<typeof deckListSchema>;
export type EnrichedDeck = Omit<
  z.output<typeof enrichedDeckSchema>,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};

export interface EnrichedDeckListData {
  decks: EnrichedDeck[];
  pageTitle?: string;
  pageLabel?: string;
}
