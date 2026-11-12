import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { deckDataSource } from "./datasources/deck-datasource";
import { deck } from "./deck";

/**
 * The decks: one entity, a slide deck, rendered by the deck templates
 * through the decks data source.
 */
export const decksPackage: EntityPackageDefinition<
  readonly [typeof deck],
  readonly []
> = defineEntityPackage({
  id: "decks",
  entities: [deck],
  dataSources: [deckDataSource(deck)],
});

export default decksPackage;

export { deck } from "./deck";
export {
  deckSchema,
  deckFrontmatterSchema,
  deckMetadataSchema,
  deckWithDataSchema,
  type DeckEntity,
  type DeckFrontmatter,
  type DeckMetadata,
  type DeckWithData,
  enrichedDeckSchema,
  type EnrichedDeck,
} from "./schemas/deck";
export { hasSlideSeparators } from "./lib/deck-markdown";
export { parseDeckData } from "./datasources/parse-helpers";
export { siteThemeMode } from "./attachments/carousel-provider";
export { buildDeckAtprotoRecord, deckAtproto } from "./atproto-projection";
export { deckTemplate } from "./templates/deck-template";
export { deckListTemplate } from "./templates/deck-list";
export {
  deckViewSchema,
  type DeckView,
  type DeckSchemaData,
} from "./templates/deck-view-schema";
