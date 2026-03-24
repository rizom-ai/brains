import { StructuredContentFormatter } from "@brains/utils";
import { deckListSchema, type DeckListData } from "./schema";

export class DeckListFormatter extends StructuredContentFormatter<DeckListData> {
  constructor() {
    super(deckListSchema, {
      title: "Deck List",
      mappings: [
        {
          key: "decks",
          label: "Decks",
          type: "array",
          itemType: "object",
        },
      ],
    });
  }
}
