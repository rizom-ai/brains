import { z } from "@brains/utils/zod";
import { deckWithDataSchema } from "../../schemas/deck";
import { deckViewSchema, type DeckView } from "../deck-view-schema";

// Schema for deck list page data (non-enriched, returned by datasource)
export const deckListSchema: z.ZodObject<{
  decks: z.ZodArray<typeof deckWithDataSchema>;
}> = z.object({
  decks: z.array(deckWithDataSchema),
});

// Schema for enriched deck list page data (used by template)
export const enrichedDeckListSchema: z.ZodObject<{
  decks: z.ZodArray<typeof deckViewSchema>;
  pageTitle: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  pageLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  decks: z.array(deckViewSchema),
  pageTitle: z.string().nullable().default(null),
  pageLabel: z.string().nullable().default(null),
});

export type DeckListSchemaData = z.output<typeof enrichedDeckListSchema>;

export type DeckListData = z.output<typeof deckListSchema>;

export interface EnrichedDeckListData {
  decks: DeckView[];
  pageTitle: string | null;
  pageLabel: string | null;
}
