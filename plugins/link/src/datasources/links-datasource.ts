import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";
import { LinkAdapter } from "../adapters/link-adapter";

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
 * Handles list view for links
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
   * Currently only supports list view (no detail page for links)
   * @param context - Optional context (environment, etc.)
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    _context?: BaseDataSourceContext,
  ): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);
    const adapter = new LinkAdapter();

    if (params.query?.id) {
      // Links don't have a detail view currently
      throw new Error("Link detail view not implemented");
    }

    // Fetch entity list
    const listOptions: Parameters<typeof this.entityService.listEntities>[1] =
      {};
    if (params.query?.limit !== undefined) {
      listOptions.limit = params.query.limit;
    } else {
      listOptions.limit = 100;
    }

    const entities = await this.entityService.listEntities(
      params.entityType,
      listOptions,
    );

    // Transform to LinkListData
    const links = entities.map((entity) => {
      const parsed = adapter.parseLinkBody(entity.content);
      return {
        id: entity.id,
        title: parsed.title,
        url: parsed.url,
        description: parsed.description,
        summary: parsed.summary,
        keywords: parsed.keywords,
        domain: parsed.domain,
        capturedAt: parsed.capturedAt,
        source: parsed.source,
      };
    });

    // Sort by captured date, newest first
    links.sort(
      (a, b) =>
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
    );

    const listData = {
      links,
      totalCount: links.length,
    };

    return outputSchema.parse(listData);
  }
}
