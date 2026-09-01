import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  EntityDataSourceConfig,
  IEntityService,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { resolveEntityCoverImage } from "@brains/image";
import {
  deckSchema,
  type DeckEntity,
  type DeckWithData,
} from "../schemas/deck";
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

  protected readonly config: EntityDataSourceConfig<DeckEntity> = {
    entityType: "deck",
    entitySchema: deckSchema,
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

  protected override async fetchDetail(
    id: string,
    entityService: IEntityService,
  ): Promise<{
    item: DeckWithData;
    navigation: NavigationResult<DeckWithData> | null;
  }> {
    const result = await super.fetchDetail(id, entityService);

    // Inject cover image as a slide directive on the first slide
    const coverImage = await resolveEntityCoverImage(
      result.item,
      entityService,
    );

    if (coverImage) {
      const directive = `<!-- .slide: data-background-image="${coverImage.url}" data-background-opacity="0.4" -->`;
      result.item = {
        ...result.item,
        body: `${directive}\n${result.item.body}`,
      };
    }

    return result;
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
