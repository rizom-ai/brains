import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import type { BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { LinkAdapter } from "../adapters/link-adapter";
import type { LinkSummary } from "../templates/link-list/schema";

/**
 * DataSource for fetching and transforming link entities.
 * Handles list views and detail views with prev/next navigation.
 */
export class LinksDataSource extends BaseEntityDataSource<
  BaseEntity,
  LinkSummary
> {
  readonly id = "link:entities";
  readonly name = "Links Entity DataSource";
  readonly description = "Fetches and transforms link entities for rendering";

  protected readonly config = {
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

  protected buildDetailResult(
    item: LinkSummary,
    navigation: NavigationResult<LinkSummary> | null,
  ) {
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
  ) {
    return {
      links: items,
      totalCount: items.length,
    };
  }
}
