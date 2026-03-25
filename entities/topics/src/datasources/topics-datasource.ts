import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  PaginationInfo,
  BaseDataSourceContext,
} from "@brains/plugins";
import type { BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { EntityUrlGenerator, truncateText } from "@brains/utils";
import type { z } from "@brains/utils";
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
  keywords: string[];
  sourceCount: number;
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
    entityType: "topic",
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
      keywords: parsed.keywords,
      sourceCount: parsed.sources.length,
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
   * Override fetch to handle detail view differently — detail needs
   * full content + source URLs, not the list summary.
   */
  override async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const { query: parsedQuery } = this.parseQuery(query);

    // Detail view: custom transform with source URL resolution
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
      const urlGenerator = EntityUrlGenerator.getInstance();
      const sources = parsed.sources.map((source) => ({
        ...source,
        href: urlGenerator.generateUrl(source.type, source.slug),
      }));

      return outputSchema.parse({
        id: entity.id,
        title: parsed.title,
        content: parsed.content,
        keywords: parsed.keywords,
        sources,
        created: entity.created,
        updated: entity.updated,
      });
    }

    // List view
    const entityService = context.entityService;
    const { items, pagination } = await this.fetchList(
      parsedQuery,
      entityService,
    );
    return outputSchema.parse(
      this.buildListResult(items, pagination, parsedQuery),
    );
  }
}
