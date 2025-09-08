import type { DataSource } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";
import { TopicAdapter } from "../lib/topic-adapter";

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
   * Fetch and transform topic entities to template-ready format
   * Returns TopicDetailData for single topic or TopicListData for multiple
   */
  async fetch<T>(query: unknown, outputSchema: z.ZodSchema<T>): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);
    const adapter = new TopicAdapter();

    if (params.query?.id) {
      // Fetch and transform single entity to TopicDetailData
      const entity = await this.entityService.getEntity(
        params.entityType,
        params.query.id,
      );

      if (!entity) {
        throw new Error(`Entity not found: ${params.query.id}`);
      }

      // Transform to TopicDetailData
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

      return outputSchema.parse(detailData);
    }

    // Fetch and transform entity list to TopicListData
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

    // Transform to TopicListData
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

    const listData = {
      topics,
      totalCount: topics.length,
    };

    return outputSchema.parse(listData);
  }
}
