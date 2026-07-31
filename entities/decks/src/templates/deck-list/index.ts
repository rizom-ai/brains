import { createTemplate, type Template } from "@brains/templates";
import {
  enrichedDeckListSchema,
  type DeckListSchemaData,
  type EnrichedDeckListData,
} from "./schema";
import { DeckListLayout } from "./layout";
import { DeckListFormatter } from "./formatter";

export const deckListTemplate: Template = createTemplate<
  DeckListSchemaData,
  EnrichedDeckListData
>({
  name: "deck-list",
  description: "List view of all presentation decks",
  schema: enrichedDeckListSchema,
  dataSourceId: "decks:entities",
  requiredPermission: "public",
  formatter: new DeckListFormatter(),
  layout: {
    component: DeckListLayout,
  },
});

export { DeckListLayout } from "./layout";
export {
  deckListSchema,
  enrichedDeckListSchema,
  type DeckListData,
  type DeckListSchemaData,
  type EnrichedDeckListData,
} from "./schema";
export { DeckListFormatter } from "./formatter";
