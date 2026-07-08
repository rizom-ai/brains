import { z } from "@brains/utils/zod";
import {
  deckWithDataSchema,
  enrichedDeckSchema,
  type EnrichedDeck,
} from "../../schemas/deck";

// Schema for deck list page data (non-enriched, returned by datasource)
export const deckListSchema: z.ZodObject<{
  decks: z.ZodArray<typeof deckWithDataSchema>;
}> = z.object({
  decks: z.array(deckWithDataSchema),
});

// Schema for enriched deck list page data (used by template)
export const enrichedDeckListSchema: z.ZodObject<{
  decks: z.ZodArray<typeof enrichedDeckSchema>;
  pageTitle: z.ZodOptional<z.ZodString>;
  pageLabel: z.ZodOptional<z.ZodString>;
}> = z.object({
  decks: z.array(enrichedDeckSchema),
  pageTitle: z.string().optional(),
  pageLabel: z.string().optional(),
});

export type DeckListData = z.output<typeof deckListSchema>;

export interface EnrichedDeckListData {
  decks: EnrichedDeck[];
  pageTitle?: string;
  pageLabel?: string;
}
