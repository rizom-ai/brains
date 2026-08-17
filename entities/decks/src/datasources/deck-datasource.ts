import { defineEntityDataSource } from "@brains/plugins";
import type { AnyEntityDataSourceDefinition } from "@brains/plugins";
import { resolveEntityCoverImage } from "@brains/image";
import type { DeckEntity, DeckWithData } from "../schemas/deck";
import { parseDeckData } from "./parse-helpers";
import { deckViewSchema } from "../templates/deck-view-schema";

/**
 * Decks list and detail.
 *
 * The detail view resolves the deck's cover image and injects it as a
 * background directive on the first slide, which is why it reads entities
 * rather than working purely over what it was handed.
 */
export const deckDataSource: AnyEntityDataSourceDefinition =
  defineEntityDataSource({
    id: "entities",
    name: "Deck Entity DataSource",
    description: "Fetches and transforms deck entities for rendering",
    entityType: "deck",
    defaultSort: [{ field: "publishedAt", direction: "desc" }],
    defaultLimit: 100,
    transform: (entity: DeckEntity): DeckWithData => parseDeckData(entity),
    list: (items: DeckWithData[]) => ({
      decks: items.map((item) => deckViewSchema.parse(item)),
    }),
    detail: async ({ item, entities }) => {
      const coverImage = await resolveEntityCoverImage(item, entities);
      const body = coverImage
        ? `<!-- .slide: data-background-image="${coverImage.url}" data-background-opacity="0.4" -->\n${item.body}`
        : item.body;
      return { markdown: body, deck: { ...item, body } };
    },
  });
