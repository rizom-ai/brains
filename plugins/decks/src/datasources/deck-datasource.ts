import type {
  DataSource,
  BaseDataSourceContext,
  IEntityService,
} from "@brains/plugins";
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

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
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

    const queryId = params.query?.id;
    if (queryId) {
      // Fetch single deck (detail view) by slug
      const entities = await this.entityService.listEntities<DeckEntity>(
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

    // Fetch decks (filtered at database level when publishedOnly is set)
    const filteredDecks = await this.entityService.listEntities<DeckEntity>(
      params.entityType,
      {
        limit: params.query?.limit ?? 100,
        ...(context.publishedOnly !== undefined && {
          publishedOnly: context.publishedOnly,
        }),
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
