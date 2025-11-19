import { createTemplate } from "@brains/templates";
import {
  enrichedDeckListSchema,
  type DeckListData,
  type EnrichedDeckListData,
} from "./schema";
import { DeckListLayout } from "./layout";
import { DeckListFormatter } from "./formatter";

export const deckListTemplate = createTemplate<
  DeckListData,
  EnrichedDeckListData
>({
  name: "deck-list",
  description: "List view of all presentation decks",
  schema: enrichedDeckListSchema, // Validate with optional url/typeLabel fields
  dataSourceId: "decks:entities",
  requiredPermission: "public",
  formatter: new DeckListFormatter(),
  layout: {
    component: DeckListLayout, // Component receives enriched data
    interactive: false,
  },
});

export { DeckListLayout } from "./layout";
export {
  deckListSchema,
  enrichedDeckListSchema,
  type DeckListData,
  type EnrichedDeckListData,
} from "./schema";
export { DeckListFormatter } from "./formatter";
