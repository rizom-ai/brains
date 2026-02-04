import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z, sortByPublicationDate } from "@brains/utils";
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

  constructor(private readonly logger: Logger) {
    this.logger.debug("DeckDataSource initialized");
  }

  /**
   * Fetch and transform deck entities to template-ready format
   * Returns { markdown } for single deck or { decks } for multiple
   * @param context - Context with environment and URL generation
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);
    // Use context.entityService for automatic publishedOnly filtering
    const entityService = context.entityService;

    const queryId = params.query?.id;
    if (queryId) {
      // Fetch single deck (detail view) by slug
      const entities = await entityService.listEntities<DeckEntity>(
        params.entityType,
        {
          filter: {
            metadata: {
              slug: queryId,
            },
          },
          limit: 1,
        },
      );

      const entity = entities[0];
      if (!entity) {
        throw new Error(`Deck not found with slug: ${queryId}`);
      }

      // Return markdown content for presentation layout
      const detailData = {
        markdown: entity.content,
      };

      return outputSchema.parse(detailData);
    }

    // Fetch decks - publishedOnly filtering is handled by scoped entityService
    const filteredDecks = await entityService.listEntities<DeckEntity>(
      params.entityType,
      {
        limit: params.query?.limit ?? 100,
      },
    );

    // Sort by publishedAt date, newest first (fall back to created if not set)
    const sortedDecks = filteredDecks.sort(sortByPublicationDate);

    // Return DeckEntity[] directly (URLs will be added by site-builder enrichment)
    const listData: DeckListData = {
      decks: sortedDecks,
    };

    this.logger.debug("Creating deck list data", {
      deckCount: sortedDecks.length,
      firstDeck: sortedDecks[0]?.id,
    });

    return outputSchema.parse(listData);
  }
}
