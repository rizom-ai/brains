import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  NavigationResult,
  PaginationInfo,
  EntityDataSourceConfig,
  IEntityService,
} from "@brains/plugins";
import type { BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { LinkAdapter } from "../adapters/link-adapter";
import type { LinkSummary } from "../templates/link-list/schema";

interface LinkDetailData {
  link: LinkSummary;
  prevLink: LinkSummary | null;
  nextLink: LinkSummary | null;
}

interface LinkListData {
  links: LinkSummary[];
  totalCount: number;
}

/**
 * DataSource for fetching and transforming link entities.
 * Handles list views and detail views with prev/next navigation.
 *
 * Overrides `fetchDetail` to use a single-pass approach: fetches
 * all entities once and derives the current item + navigation in memory,
 * avoiding a redundant second DB round-trip.
 */
export class LinksDataSource extends BaseEntityDataSource<
  BaseEntity,
  LinkSummary
> {
  readonly id = "link:entities";
  readonly name = "Links Entity DataSource";
  readonly description = "Fetches and transforms link entities for rendering";

  protected readonly config: EntityDataSourceConfig = {
    entityType: "link",
    defaultSort: [{ field: "capturedAt" as const, direction: "desc" as const }],
    defaultLimit: 1000,
    lookupField: "id" as const,
    enableNavigation: true,
  };

  private readonly adapter = new LinkAdapter();

  constructor(logger: Logger) {
    super(logger);
    this.logger.debug("LinksDataSource initialized");
  }

  protected transformEntity(entity: BaseEntity): LinkSummary {
    const { frontmatter, summary } = this.adapter.parseLinkContent(
      entity.content,
    );
    return {
      id: entity.id,
      ...frontmatter,
      summary,
    };
  }

  protected override buildDetailResult(
    item: LinkSummary,
    navigation: NavigationResult<LinkSummary> | null,
  ): LinkDetailData {
    return {
      link: item,
      prevLink: navigation?.prev ?? null,
      nextLink: navigation?.next ?? null,
    };
  }

  protected buildListResult(
    items: LinkSummary[],
    _pagination: PaginationInfo | null,
    _query: BaseQuery,
  ): LinkListData {
    return {
      links: items,
      totalCount: items.length,
    };
  }

  /**
   * Single-pass detail fetch: loads all entities once, finds the current
   * item and prev/next in memory. Avoids the base class's two-call pattern
   * (lookupEntity + resolveNavigation) since links are fetched in bulk anyway.
   */
  protected override async fetchDetail(
    id: string,
    entityService: IEntityService,
  ): Promise<{
    item: LinkSummary;
    navigation: NavigationResult<LinkSummary> | null;
  }> {
    const allEntities = await entityService.listEntities<BaseEntity>(
      this.config.entityType,
      {
        limit: this.config.navigationLimit ?? 1000,
        sortFields: this.config.defaultSort,
      },
    );

    const currentIndex = allEntities.findIndex((e) => e.id === id);
    if (currentIndex === -1) {
      throw new Error(`${this.config.entityType} not found: ${id}`);
    }

    const current = allEntities[currentIndex];
    if (!current) {
      throw new Error(`${this.config.entityType} not found: ${id}`);
    }
    const item = this.transformEntity(current);
    const prevEntity =
      currentIndex > 0 ? allEntities[currentIndex - 1] : undefined;
    const nextEntity =
      currentIndex < allEntities.length - 1
        ? allEntities[currentIndex + 1]
        : undefined;

    return {
      item,
      navigation: {
        prev: prevEntity ? this.transformEntity(prevEntity) : null,
        next: nextEntity ? this.transformEntity(nextEntity) : null,
      },
    };
  }
}
