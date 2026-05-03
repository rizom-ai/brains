import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  PaginationInfo,
  BaseDataSourceContext,
} from "@brains/plugins";
import type { BaseEntity } from "@brains/plugins";
import type { Logger, z } from "@brains/utils";
import { TOPIC_ENTITY_TYPE } from "../lib/constants";
import { toTopicDetail, toTopicSummary } from "../lib/topic-presenter";
import type { TopicDetailData } from "../templates/topic-detail/schema";
import type {
  TopicListData,
  TopicSummary,
} from "../templates/topic-list/schema";

/**
 * DataSource for fetching and transforming topic entities.
 * Handles both list and detail views for topics.
 */
export class TopicsDataSource extends BaseEntityDataSource<
  BaseEntity,
  TopicSummary
> {
  readonly id = "topics:entities";
  readonly name = "Topics Entity DataSource";
  readonly description = "Fetches and transforms topic entities for rendering";

  protected readonly config = {
    entityType: TOPIC_ENTITY_TYPE,
    defaultSort: [{ field: "updated" as const, direction: "desc" as const }],
    defaultLimit: 100,
    lookupField: "id" as const,
  };

  constructor(logger: Logger) {
    super(logger);
    this.logger.debug("TopicsDataSource initialized");
  }

  protected transformEntity(entity: BaseEntity): TopicSummary {
    return toTopicSummary(entity);
  }

  protected buildListResult(
    items: TopicSummary[],
    _pagination: PaginationInfo | null,
    _query: BaseQuery,
  ): TopicListData {
    return {
      topics: items,
      totalCount: items.length,
    };
  }

  /**
   * Override fetch to handle detail view — detail needs full content.
   */
  override async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const { query: parsedQuery } = this.parseQuery(query);

    if (parsedQuery.id) {
      const entityService = context.entityService;
      const entity = await entityService.getEntity(
        this.config.entityType,
        parsedQuery.id,
      );

      if (!entity) {
        throw new Error(`Entity not found: ${parsedQuery.id}`);
      }

      return outputSchema.parse(
        toTopicDetail(entity) satisfies TopicDetailData,
      );
    }

    return super.fetch(query, outputSchema, context);
  }
}
