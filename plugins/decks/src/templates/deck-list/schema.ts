import { z } from "@brains/utils";

// Schema for individual deck in list
const deckItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  updated: z.string(),
  created: z.string(),
});

// Schema for deck list page data
export const deckListSchema = z.object({
  decks: z.array(deckItemSchema),
});

export type DeckItem = z.infer<typeof deckItemSchema>;
export type DeckListData = z.infer<typeof deckListSchema>;
