import {
  BaseEntityDataSource,
  type BaseQuery,
  type NavigationResult,
  type PaginationInfo,
} from "@brains/plugins";
import type { BaseDataSourceContext, IEntityService } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger, z } from "@brains/utils";
import type { SocialPost } from "../schemas/social-post";
import {
  socialPostFrontmatterSchema,
  socialPostWithDataSchema,
  type SocialPostWithData,
} from "../schemas/social-post";

interface SocialPostQuery extends BaseQuery {
  platform?: "linkedin";
  status?: "draft" | "queued" | "published" | "failed";
  sortByQueue?: boolean;
  nextInQueue?: boolean;
}

/**
 * Parse frontmatter and extract body from entity.
 */
function parsePostData(entity: SocialPost): SocialPostWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    socialPostFrontmatterSchema,
  );

  return socialPostWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
  });
}

/**
 * DataSource for fetching and transforming social post entities.
 * Handles list views, queue management, and filtering by status/platform.
 */
export class SocialPostDataSource extends BaseEntityDataSource<
  SocialPost,
  SocialPostWithData
> {
  readonly id = "social-media:posts";
  readonly name = "Social Post DataSource";
  readonly description =
    "Fetches and transforms social post entities for queue management and publishing";

  protected readonly config = {
    entityType: "social-post",
    defaultSort: [
      {
        field: "publishedAt" as const,
        direction: "desc" as const,
        nullsFirst: true,
      },
      { field: "created" as const, direction: "desc" as const },
    ],
    defaultLimit: 100,
  };

  constructor(logger: Logger) {
    super(logger);
    this.logger.debug("SocialPostDataSource initialized");
  }

  protected transformEntity(entity: SocialPost): SocialPostWithData {
    return parsePostData(entity);
  }

  protected buildDetailResult(
    item: SocialPostWithData,
    _navigation: NavigationResult<SocialPostWithData> | null,
  ) {
    return { post: item };
  }

  protected buildListResult(
    items: SocialPostWithData[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ) {
    return {
      posts: items,
      totalCount: pagination?.totalItems ?? items.length,
      pagination,
      baseUrl: query.baseUrl,
    };
  }

  /**
   * Override fetch to handle custom cases: nextInQueue and filtered lists.
   */
  override async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = query as {
      entityType?: string;
      query?: SocialPostQuery;
    };

    const entityService = context.entityService;

    // Case 1: Next in queue
    if (params.query?.nextInQueue) {
      return this.fetchNextInQueue(outputSchema, entityService);
    }

    // Case 2: Single post by slug
    if (params.query?.id) {
      const { item } = await this.fetchDetail(params.query.id, entityService);
      return outputSchema.parse(this.buildDetailResult(item, null));
    }

    // Case 3: Filtered list
    const metadataFilter: Record<string, string> = {};
    if (params.query?.platform)
      metadataFilter["platform"] = params.query.platform;
    if (params.query?.status) metadataFilter["status"] = params.query.status;
    const hasFilter = Object.keys(metadataFilter).length > 0;

    const sortFields = params.query?.sortByQueue
      ? [{ field: "queueOrder" as const, direction: "asc" as const }]
      : this.config.defaultSort;

    const baseQuery: BaseQuery = params.query ?? {};
    const { items, pagination } = await this.fetchList(
      baseQuery,
      entityService,
      {
        ...(hasFilter && { filter: { metadata: metadataFilter } }),
        sortFields,
      },
    );

    return outputSchema.parse(
      this.buildListResult(items, pagination, baseQuery),
    );
  }

  /**
   * Fetch the next post in queue (lowest queueOrder with status=queued).
   */
  private async fetchNextInQueue<T>(
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const entities = await entityService.listEntities<SocialPost>(
      "social-post",
      {
        filter: { metadata: { status: "queued" } },
        sortFields: [{ field: "queueOrder", direction: "asc" }],
        limit: 1,
      },
    );

    const entity = entities[0];
    const post = entity ? parsePostData(entity) : null;

    return outputSchema.parse({ post });
  }
}
