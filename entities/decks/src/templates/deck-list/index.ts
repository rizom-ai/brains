import { createTemplate, type Template } from "@brains/sdk/entities";
import {
  enrichedDeckListSchema,
  type DeckListSchemaData,
  type EnrichedDeckListData,
} from "./schema";
import { DeckListLayout } from "./layout";

export const deckListTemplate: Template = createTemplate<
  DeckListSchemaData,
  EnrichedDeckListData
>({
  name: "deck-list",
  description: "List view of all presentation decks",
  schema: enrichedDeckListSchema,
  dataSourceId: "entities",
  requiredPermission: "public",
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
