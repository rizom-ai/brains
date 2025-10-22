import { createTemplate } from "@brains/templates";
import { deckListSchema, type DeckListData } from "./schema";
import { DeckListLayout } from "./layout";
import { DeckListFormatter } from "./formatter";

export const deckListTemplate = createTemplate<DeckListData>({
  name: "deck-list",
  description: "List view of all presentation decks",
  schema: deckListSchema,
  dataSourceId: "decks:entities",
  requiredPermission: "public",
  formatter: new DeckListFormatter(),
  layout: {
    component: DeckListLayout,
    interactive: false,
  },
});

export { DeckListLayout } from "./layout";
export { deckListSchema, type DeckListData } from "./schema";
export { DeckListFormatter } from "./formatter";
