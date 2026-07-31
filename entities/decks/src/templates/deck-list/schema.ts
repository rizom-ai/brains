import { z } from "@brains/utils/zod";
import { deckWithDataSchema } from "../../schemas/deck";
import {
  deckViewSchema,
  type DeckSchemaData,
  type DeckView,
} from "../deck-view-schema";

// Schema for deck list page data (non-enriched, returned by datasource)
export const deckListSchema: z.ZodObject<{
  decks: z.ZodArray<typeof deckWithDataSchema>;
}> = z.object({
  decks: z.array(deckWithDataSchema),
});

// Schema for enriched deck list page data (used by template)
export interface DeckListSchemaData {
  decks: DeckSchemaData[];
  pageTitle: string | null;
  pageLabel: string | null;
}

export const enrichedDeckListSchema: z.ZodType<DeckListSchemaData> = z.object({
  decks: z.array(deckViewSchema),
  pageTitle: z.string().nullable().default(null),
  pageLabel: z.string().nullable().default(null),
});

export type DeckListData = z.output<typeof deckListSchema>;

export interface EnrichedDeckListData {
  decks: DeckView[];
  pageTitle: string | null;
  pageLabel: string | null;
}
