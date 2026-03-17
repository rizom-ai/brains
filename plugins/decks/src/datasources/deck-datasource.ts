import {
  BaseEntityDataSource,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  BaseQuery,
  IEntityService,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { resolveEntityCoverImage } from "@brains/image";
import { deckFrontmatterSchema } from "../schemas/deck";
import type { DeckEntity, DeckWithData } from "../schemas/deck";

interface DeckDetailData {
  markdown: string;
}

interface DeckListData {
  decks: DeckWithData[];
}

/**
 * DataSource for fetching and transforming deck entities.
 * Handles both detail views (single deck) and list views (all decks).
 */
export class DeckDataSource extends BaseEntityDataSource<
  DeckEntity,
  DeckWithData
> {
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

  protected transformEntity(entity: DeckEntity): DeckWithData {
    const { metadata: frontmatter, content: body } =
      parseMarkdownWithFrontmatter(entity.content, deckFrontmatterSchema);
    return { ...entity, frontmatter, body };
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
      { content: result.item.content } as DeckEntity,
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
    return { markdown: item.body };
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

    return { decks: items };
  }
}
