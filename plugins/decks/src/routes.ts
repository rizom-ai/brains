import type { RouteDefinition } from "@brains/plugins";

/**
 * Generate deck routes with fullscreen layout
 * These routes will be registered dynamically by the DeckSPlugin
 * based on discovered deck entities
 */
export function createDeckRoutes(deckIds: string[]): RouteDefinition[] {
  return deckIds.map((id) => ({
    id: `deck-${id}`,
    path: `/decks/${id}`,
    title: `Deck: ${id}`,
    description: `View presentation deck`,
    layout: "fullscreen",
    sections: [
      {
        id: "presentation",
        template: "deck-detail",
        dataQuery: {
          entityType: "deck",
          query: { id },
        },
      },
    ],
    sourceEntityType: "deck",
  }));
}
