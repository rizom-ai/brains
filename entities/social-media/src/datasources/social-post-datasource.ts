import {
  BaseEntityDataSource,
  type BaseQuery,
  type EntityDataSourceConfig,
  type NavigationResult,
  type PaginationInfo,
} from "@brains/plugins";
import type {
  BaseDataSourceContext,
  DataSourceSchema,
  IEntityService,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils/zod";
import type { SocialPost } from "../schemas/social-post";
import {
  socialPostFrontmatterSchema,
  socialPostWithDataSchema,
  type SocialPostWithData,
} from "../schemas/social-post";

interface SocialPostQuery {
  [key: string]: unknown;
  id?: string | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  baseUrl?: string | undefined;
  platform?: "linkedin" | undefined;
  status?:
    "generating" | "draft" | "queued" | "published" | "failed" | undefined;
  sortByQueue?: boolean | undefined;
  nextInQueue?: boolean | undefined;
}

interface SocialPostInput {
  entityType?: string | undefined;
  query?: SocialPostQuery | undefined;
}

const socialPostQuerySchema: z.ZodType<SocialPostQuery> = z.looseObject({
  id: z.string().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  baseUrl: z.string().optional(),
  platform: z.enum(["linkedin"]).optional(),
  status: z
    .enum(["generating", "draft", "queued", "published", "failed"])
    .optional(),
  sortByQueue: z.boolean().optional(),
  nextInQueue: z.boolean().optional(),
});

const socialPostInputSchema: z.ZodType<SocialPostInput> = z.looseObject({
  entityType: z.string().optional(),
  query: socialPostQuerySchema.optional(),
});

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
  readonly id: string = "social-media:posts";
  readonly name: string = "Social Post DataSource";
  readonly description: string =
    "Fetches and transforms social post entities for queue management and publishing";

  protected readonly config: EntityDataSourceConfig = {
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
    outputSchema: DataSourceSchema<T>,
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

    const sortFields: EntityDataSourceConfig["defaultSort"] =
      parsedQuery.sortByQueue
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
    outputSchema: DataSourceSchema<T>,
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
