/**
 * Decks package.
 *
 * One entity: a slide deck rendered from markdown. No configuration, so
 * this is an entity package rather than a service one.
 */

import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/plugins";
import { deck } from "./deck-entity";

const decksPackage: EntityPackageDefinition<
  readonly [typeof deck],
  readonly []
> = defineEntityPackage({ id: "decks", entities: [deck] });

export default decksPackage;

export { deck } from "./deck-entity";
export { deckGeneration } from "./handlers/deckGenerationJobHandler";
export {
  deckSchema,
  deckFrontmatterSchema,
  deckWithDataSchema,
  type DeckEntity,
  type DeckFrontmatter,
  type DeckWithData,
  enrichedDeckSchema,
  type EnrichedDeck,
} from "./schemas/deck";
export { DeckAdapter, deckAdapter } from "./adapters/deck-adapter";
export { parseDeckData } from "./datasources/parse-helpers";
export {
  buildDeckAtprotoRecord,
  createDeckAtprotoProjection,
} from "./atproto-projection";
export { deckTemplate } from "./templates/deck-template";
export { deckListTemplate } from "./templates/deck-list";
export {
  deckViewSchema,
  type DeckView,
  type DeckSchemaData,
} from "./templates/deck-view-schema";
