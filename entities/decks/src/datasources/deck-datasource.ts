import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  EntityDataSourceConfig,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { DeckEntity, DeckWithData } from "../schemas/deck";
import { parseDeckData } from "./parse-helpers";
import {
  deckViewSchema,
  type DeckSchemaData,
} from "../templates/deck-view-schema";

interface DeckDetailData {
  markdown: string;
  deck: DeckWithData;
}

interface DeckListData {
  decks: DeckSchemaData[];
}

/**
 * DataSource for fetching and transforming deck entities.
 * Handles both detail views (single deck) and list views (all decks).
 */
export class DeckDataSource extends BaseEntityDataSource<
  DeckEntity,
  DeckWithData,
  DeckListData
> {
  readonly id: string = "decks:entities";
  readonly name: string = "Deck Entity DataSource";
  readonly description: string =
    "Fetches and transforms deck entities for rendering";

  protected readonly config: EntityDataSourceConfig = {
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

  protected transformEntity(entity: DeckEntity): DeckWithData {
    return parseDeckData(entity);
  }

  protected override buildDetailResult(
    item: DeckWithData,
    _navigation: NavigationResult<DeckWithData> | null,
  ): DeckDetailData {
    return { markdown: item.body, deck: item };
  }

  protected buildListResult(
    items: DeckWithData[],
    _pagination: PaginationInfo | null,
    _query: BaseQuery,
  ): DeckListData {
    this.logger.debug("Creating deck list data", {
      deckCount: items.length,
      firstDeck: items[0]?.id,
    });

    return { decks: items.map((item) => deckViewSchema.parse(item)) };
  }
}
