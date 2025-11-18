import { z } from "@brains/utils";

// Schema for individual deck in list (non-enriched, returned by datasource)
const deckItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  updated: z.string(),
  created: z.string(),
  entityType: z.string(),
  content: z.string(), // Required for site-builder enrichment
  metadata: z.record(z.string(), z.unknown()), // Generic metadata (must have slug for enrichment)
});

// Schema for enriched deck in list (after site-builder enrichment)
const enrichedDeckItemSchema = deckItemSchema.extend({
  url: z.string(),
  typeLabel: z.string(),
});

// Schema for deck list page data (non-enriched, returned by datasource)
export const deckListSchema = z.object({
  decks: z.array(deckItemSchema),
});

// Schema for enriched deck list page data (used by template)
export const enrichedDeckListSchema = z.object({
  decks: z.array(enrichedDeckItemSchema),
});

export type DeckItem = z.infer<typeof deckItemSchema>;
export type EnrichedDeckItem = z.infer<typeof enrichedDeckItemSchema>;
export type DeckListData = z.infer<typeof deckListSchema>;
export type EnrichedDeckListData = z.infer<typeof enrichedDeckListSchema>;
