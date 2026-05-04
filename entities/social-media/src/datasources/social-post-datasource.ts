import {
  BaseEntityDataSource,
  baseQuerySchema,
  baseInputSchema,
  type BaseQuery,
  type NavigationResult,
  type PaginationInfo,
} from "@brains/plugins";
import type { BaseDataSourceContext, IEntityService } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import type { SocialPost } from "../schemas/social-post";
import {
  socialPostFrontmatterSchema,
  socialPostWithDataSchema,
  type SocialPostWithData,
} from "../schemas/social-post";

const socialPostQuerySchema = baseQuerySchema.extend({
  platform: z.enum(["linkedin"]).optional(),
  status: z.enum(["draft", "queued", "published", "failed"]).optional(),
  sortByQueue: z.boolean().optional(),
  nextInQueue: z.boolean().optional(),
});

const socialPostInputSchema = baseInputSchema.extend({
  query: socialPostQuerySchema.optional(),
});

type SocialPostQuery = z.infer<typeof socialPostQuerySchema>;

/**
 * Parse frontmatter and extract body from entity.
 */
interface SocialPostDetailData {
  post: SocialPostWithData;
}

interface SocialPostListData {
  posts: SocialPostWithData[];
  totalCount: number;
  pagination: PaginationInfo | null;
  baseUrl: string | undefined;
}

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

  protected override parseQuery(query: unknown): {
    entityType: string;
    query: SocialPostQuery;
  } {
    const parsed = socialPostInputSchema.parse(query);
    return {
      entityType: parsed.entityType ?? this.config.entityType,
      query: parsed.query ?? {},
    };
  }

  protected transformEntity(entity: SocialPost): SocialPostWithData {
    return parsePostData(entity);
  }

  protected override buildDetailResult(
    item: SocialPostWithData,
    _navigation: NavigationResult<SocialPostWithData> | null,
  ): SocialPostDetailData {
    return { post: item };
  }

  protected buildListResult(
    items: SocialPostWithData[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): SocialPostListData {
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
    const { query: parsedQuery } = this.parseQuery(query);
    const entityService = context.entityService;

    // Case 1: Next in queue
    if (parsedQuery.nextInQueue) {
      return this.fetchNextInQueue(outputSchema, entityService);
    }

    // Case 2: Single post by slug
    if (parsedQuery.id) {
      const { item } = await this.fetchDetail(parsedQuery.id, entityService);
      return outputSchema.parse(this.buildDetailResult(item, null));
    }

    // Case 3: Filtered list
    const metadataFilter: Record<string, string> = {};
    if (parsedQuery.platform) metadataFilter["platform"] = parsedQuery.platform;
    if (parsedQuery.status) metadataFilter["status"] = parsedQuery.status;
    const hasFilter = Object.keys(metadataFilter).length > 0;

    const sortFields = parsedQuery.sortByQueue
      ? [{ field: "queueOrder" as const, direction: "asc" as const }]
      : this.config.defaultSort;

    const { items, pagination } = await this.fetchList(
      parsedQuery,
      entityService,
      {
        ...(hasFilter && { filter: { metadata: metadataFilter } }),
        sortFields,
      },
    );

    return outputSchema.parse(
      this.buildListResult(items, pagination, parsedQuery),
    );
  }

  /**
   * Fetch the next post in queue (lowest queueOrder with status=queued).
   */
  private async fetchNextInQueue<T>(
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const entities = await entityService.listEntities<SocialPost>({
      entityType: this.config.entityType,
      options: {
        filter: { metadata: { status: "queued" } },
        sortFields: [{ field: "queueOrder", direction: "asc" }],
        limit: 1,
      },
    });

    const entity = entities[0];
    const post = entity ? parsePostData(entity) : null;

    return outputSchema.parse({ post });
  }
}
