import { z } from "@brains/utils";
import {
  deckSchema,
  enrichedDeckSchema,
  type EnrichedDeck,
} from "../../schemas/deck";

// Schema for deck list page data (non-enriched, returned by datasource)
export const deckListSchema = z.object({
  decks: z.array(deckSchema),
});

// Schema for enriched deck list page data (used by template)
export const enrichedDeckListSchema = z.object({
  decks: z.array(enrichedDeckSchema),
});

export type DeckListData = z.infer<typeof deckListSchema>;
export interface EnrichedDeckListData {
  decks: EnrichedDeck[];
}
