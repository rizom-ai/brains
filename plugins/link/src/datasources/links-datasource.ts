import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";
import { LinkAdapter } from "../adapters/link-adapter";
import type { LinkListData, LinkSummary } from "../templates/link-list/schema";
import type {
  LinkDetailData,
  LinkDetail,
} from "../templates/link-detail/schema";

// Schema for fetch query parameters
const entityFetchQuerySchema = z.object({
  entityType: z.string(),
  query: z
    .object({
      id: z.string().optional(),
      limit: z.number().optional(),
    })
    .optional(),
});

/**
 * DataSource for fetching and transforming link entities
 */
export class LinksDataSource implements DataSource {
  public readonly id = "link:entities";
  public readonly name = "Links Entity DataSource";
  public readonly description =
    "Fetches and transforms link entities for rendering";

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.logger.debug("LinksDataSource initialized");
  }

  /**
   * Fetch and transform link entities to template-ready format
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context?: BaseDataSourceContext,
  ): Promise<T> {
    const params = entityFetchQuerySchema.parse(query);
    const adapter = new LinkAdapter();

    // Fetch links (filtered at database level when publishedOnly is set)
    const entities = await this.entityService.listEntities(params.entityType, {
      limit: 1000,
      ...(context?.publishedOnly !== undefined && {
        publishedOnly: context.publishedOnly,
      }),
    });

    // Transform entities to LinkSummary
    const links: LinkSummary[] = entities.map((entity) => {
      const { frontmatter, summary } = adapter.parseLinkContent(entity.content);
      return {
        id: entity.id,
        ...frontmatter,
        summary,
      };
    });

    // Sort by captured date, newest first
    links.sort(
      (a, b) =>
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
    );

    // Handle detail view
    if (params.query?.id) {
      return this.fetchDetail(params.query.id, links, outputSchema);
    }

    // Handle list view
    const listData: LinkListData = {
      links,
      totalCount: links.length,
    };

    return outputSchema.parse(listData);
  }

  /**
   * Fetch detail view with prev/next navigation
   */
  private fetchDetail<T>(
    id: string,
    sortedLinks: LinkSummary[],
    outputSchema: z.ZodSchema<T>,
  ): T {
    const linkIndex = sortedLinks.findIndex((l) => l.id === id);

    if (linkIndex === -1) {
      throw new Error(`Link with id "${id}" not found`);
    }

    const link = sortedLinks[linkIndex];
    const prevLink = linkIndex > 0 ? sortedLinks[linkIndex - 1] : null;
    const nextLink =
      linkIndex < sortedLinks.length - 1 ? sortedLinks[linkIndex + 1] : null;

    const detailData: LinkDetailData = {
      link: link as LinkDetail,
      prevLink: prevLink as LinkDetail | null,
      nextLink: nextLink as LinkDetail | null,
    };

    return outputSchema.parse(detailData);
  }
}
