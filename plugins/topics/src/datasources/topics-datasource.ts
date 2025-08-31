import type { DataSource } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";
import { TopicAdapter } from "../lib/topic-adapter";
import { topicEntitySchema } from "../schemas/topic";

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
 * DataSource for fetching and transforming topic entities
 * Handles both list and detail views for topics
 */
export class TopicsDataSource implements DataSource {
  public readonly id = "topics:entities";
  public readonly name = "Topics Entity DataSource";
  public readonly description =
    "Fetches and transforms topic entities for rendering";

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.logger.debug("TopicsDataSource initialized");
  }

  /**
   * Fetch raw topic entities based on query
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
   * @param format - "list" or "detail"
   * @param schema - Target schema for validation
   */
  async transform<T>(
    content: unknown,
    format: string,
    schema: z.ZodSchema<T>,
  ): Promise<T> {
    const adapter = new TopicAdapter();

    if (format === "detail") {
      // Transform single entity to TopicDetailData
      const entity = topicEntitySchema.parse(content);
      const parsed = adapter.parseTopicBody(entity.content);

      const detailData = {
        id: entity.id,
        title: parsed.title,
        summary: parsed.summary,
        content: parsed.content,
        keywords: parsed.keywords,
        sources: parsed.sources.map((id) => ({
          id,
          title: `Source ${id}`,
          type: "unknown",
        })),
        created: entity.created,
        updated: entity.updated,
      };

      return schema.parse(detailData);
    }

    if (format === "list") {
      // Transform entity array to TopicListData
      const entities = z.array(topicEntitySchema).parse(content);

      const topics = entities.map((entity) => {
        const parsed = adapter.parseTopicBody(entity.content);
        return {
          id: entity.id,
          title: parsed.title,
          summary: parsed.summary,
          keywords: parsed.keywords,
          sourceCount: parsed.sources.length,
          created: entity.created,
          updated: entity.updated,
        };
      });

      // Sort by updated date, newest first
      topics.sort(
        (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
      );

      return schema.parse({
        topics,
        totalCount: topics.length,
      });
    }

    throw new Error(`Unknown transform format: ${format}`);
  }
}
