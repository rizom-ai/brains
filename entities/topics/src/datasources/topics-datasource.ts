import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  PaginationInfo,
  BaseDataSourceContext,
} from "@brains/plugins";
import type { BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { truncateText } from "@brains/utils";
import type { z } from "@brains/utils";
import { TOPIC_ENTITY_TYPE } from "../lib/constants";
import { TopicAdapter } from "../lib/topic-adapter";

interface TopicListData {
  topics: TopicListItem[];
  totalCount: number;
}

/** List-view representation of a topic. */
interface TopicListItem {
  id: string;
  title: string;
  summary: string;
  created: string;
  updated: string;
}

/**
 * DataSource for fetching and transforming topic entities.
 * Handles both list and detail views for topics.
 */
export class TopicsDataSource extends BaseEntityDataSource<
  BaseEntity,
  TopicListItem
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

  private readonly adapter = new TopicAdapter();

  constructor(logger: Logger) {
    super(logger);
    this.logger.debug("TopicsDataSource initialized");
  }

  protected transformEntity(entity: BaseEntity): TopicListItem {
    const parsed = this.adapter.parseTopicBody(entity.content);
    return {
      id: entity.id,
      title: parsed.title,
      summary: truncateText(parsed.content, 200),
      created: entity.created,
      updated: entity.updated,
    };
  }

  protected buildListResult(
    items: TopicListItem[],
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

      const parsed = this.adapter.parseTopicBody(entity.content);

      return outputSchema.parse({
        id: entity.id,
        title: parsed.title,
        content: parsed.content,
        created: entity.created,
        updated: entity.updated,
      });
    }

    return super.fetch(query, outputSchema, context);
  }
}
