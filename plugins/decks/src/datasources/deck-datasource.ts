import type { DataSource } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";
import type { DeckEntity } from "../schemas/deck";
import type { DeckListData } from "../templates/deck-list/schema";

// Schema for fetch query parameters
const entityFetchQuerySchema = z.object({
  entityType: z.literal("deck"),
  query: z
    .object({
      id: z.string().optional(),
      limit: z.number().optional(),
    })
    .optional(),
});

/**
 * DataSource for fetching and transforming deck entities
 * Handles both detail views (single deck) and list views (all decks)
 */
export class DeckDataSource implements DataSource {
  public readonly id = "decks:entities";
  public readonly name = "Deck Entity DataSource";
  public readonly description =
    "Fetches and transforms deck entities for rendering";

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.logger.debug("DeckDataSource initialized");
  }

  /**
   * Fetch and transform deck entities to template-ready format
   * Returns { markdown } for single deck or { decks } for multiple
   */
  async fetch<T>(query: unknown, outputSchema: z.ZodSchema<T>): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);

    const queryId = params.query?.id;
    if (queryId) {
      // Fetch single deck (detail view)
      const entity = await this.entityService.getEntity<DeckEntity>(
        params.entityType,
        queryId,
      );

      if (!entity) {
        throw new Error(`Deck not found: ${queryId}`);
      }

      // Return markdown content for presentation layout
      const detailData = {
        markdown: entity.content,
      };

      return outputSchema.parse(detailData);
    }

    // Fetch multiple decks (list view)
    const entities = await this.entityService.listEntities<DeckEntity>(
      params.entityType,
      {
        limit: params.query?.limit ?? 100,
      },
    );

    // Transform to DeckListData
    const decks = entities.map((deck) => ({
      id: deck.id,
      title: deck.title,
      description: deck.description,
      author: deck.author,
      updated: deck.updated,
      created: deck.created,
    }));

    const listData: DeckListData = {
      decks,
    };

    this.logger.debug("Creating deck list data", {
      deckCount: decks.length,
      firstDeck: decks[0]?.id,
    });

    return outputSchema.parse(listData);
  }
}
