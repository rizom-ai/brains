import {
  BaseEntityDataSource,
  type BaseQuery,
  type EntityDataSourceConfig,
  type NavigationResult,
  type PaginationInfo,
} from "@brains/plugins";
import type { BaseDataSourceContext, DataSourceSchema } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { socialPostSchema, type SocialPost } from "../schemas/social-post";
import {
  socialPostFrontmatterSchema,
  socialPostWithDataSchema,
  type SocialPostWithData,
} from "../schemas/social-post";
import {
  socialPostViewSchema,
  type SocialPostSchemaData,
} from "../templates/social-post-view";

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
  posts: SocialPostSchemaData[];
  totalCount: number;
  pagination: PaginationInfo | null;
  baseUrl: string | null;
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
  SocialPostWithData,
  SocialPostListData
> {
  readonly id: string = "social-media:posts";
  readonly name: string = "Social Post DataSource";
  readonly description: string =
    "Fetches and transforms social post entities for queue management and publishing";

  protected readonly config: EntityDataSourceConfig<SocialPost> = {
    entityType: "social-post",
    entitySchema: socialPostSchema,
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
      posts: items.map((item) => socialPostViewSchema.parse(item)),
      totalCount: pagination?.totalItems ?? items.length,
      pagination,
      baseUrl: query.baseUrl ?? null,
    };
  }

  /**
   * Override fetch to handle custom cases: single post by slug and
   * platform/status-filtered lists. Queue ordering is content-pipeline's
   * runtime state, not entity metadata, so no queue query exists here.
   */
  override async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const { query: parsedQuery } = this.parseQuery(query);
    const entityService = context.entityService;

    // Case 1: Single post by slug
    if (parsedQuery.id) {
      const { item } = await this.fetchDetail(parsedQuery.id, entityService);
      return outputSchema.parse(this.buildDetailResult(item, null));
    }

    // Case 2: Filtered list
    const metadataFilter: Record<string, string> = {};
    if (parsedQuery.platform) metadataFilter["platform"] = parsedQuery.platform;
    if (parsedQuery.status) metadataFilter["status"] = parsedQuery.status;
    const hasFilter = Object.keys(metadataFilter).length > 0;

    const { items, pagination } = await this.fetchList(
      parsedQuery,
      entityService,
      {
        ...(hasFilter && { filter: { metadata: metadataFilter } }),
        sortFields: this.config.defaultSort,
      },
    );

    return outputSchema.parse(
      this.buildListResult(items, pagination, parsedQuery),
    );
  }
}
