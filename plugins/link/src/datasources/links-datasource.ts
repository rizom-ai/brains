import type { DataSource } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";
import { LinkAdapter } from "../adapters/link-adapter";
import { linkSchema } from "../schemas/link";

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
   * Fetch raw link entities based on query
   * Returns validated entity or entity array
   */
  async fetch<T>(query: unknown): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);

    if (params.query?.id) {
      // Fetch single entity
      const entity = await this.entityService.getEntity(
        params.entityType,
        params.query.id,
      );

      if (!entity) {
        throw new Error(`Entity not found: ${params.query.id}`);
      }
      return entity as T;
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

    return entities as T;
  }

  /**
   * Transform entities to template format
   * @param content - Raw entities from fetch
   * @param format - "list" format for now (no detail page)
   * @param schema - Target schema for validation
   */
  async transform<T>(
    content: unknown,
    format: string,
    schema: z.ZodSchema<T>,
  ): Promise<T> {
    const adapter = new LinkAdapter();

    if (format === "list") {
      // Transform entity array to LinkListData
      const entities = z.array(linkSchema).parse(content);

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
          conversationId: entity.metadata?.["conversationId"] as
            | string
            | undefined,
        };
      });

      // Sort by captured date, newest first
      links.sort(
        (a, b) =>
          new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
      );

      return schema.parse({
        links,
        totalCount: links.length,
      });
    }

    throw new Error(`Unknown transform format: ${format}`);
  }
}
