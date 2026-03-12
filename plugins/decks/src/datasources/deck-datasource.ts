import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { DeckEntity } from "../schemas/deck";

/**
 * DataSource for fetching and transforming deck entities.
 * Handles both detail views (single deck) and list views (all decks).
 */
export class DeckDataSource extends BaseEntityDataSource<DeckEntity> {
  readonly id = "decks:entities";
  readonly name = "Deck Entity DataSource";
  readonly description = "Fetches and transforms deck entities for rendering";

  protected readonly config = {
    entityType: "deck",
    defaultSort: [
      { field: "publishedAt" as const, direction: "desc" as const },
    ],
    defaultLimit: 100,
  };

  constructor(logger: Logger) {
    super(logger);
    this.logger.debug("DeckDataSource initialized");
  }

  protected transformEntity(entity: DeckEntity): DeckEntity {
    return entity;
  }

  protected buildDetailResult(
    item: DeckEntity,
    _navigation: NavigationResult<DeckEntity> | null,
  ) {
    return { markdown: item.content };
  }

  protected buildListResult(
    items: DeckEntity[],
    _pagination: PaginationInfo | null,
    _query: BaseQuery,
  ) {
    this.logger.debug("Creating deck list data", {
      deckCount: items.length,
      firstDeck: items[0]?.id,
    });

    return { decks: items };
  }
}
