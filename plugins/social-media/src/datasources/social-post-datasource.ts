import type {
  IEntityService,
  DataSource,
  BaseDataSourceContext,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  parseMarkdownWithFrontmatter,
  buildPaginationInfo,
} from "@brains/plugins";
import { z } from "@brains/utils";
import type { SocialPost } from "../schemas/social-post";
import {
  socialPostFrontmatterSchema,
  socialPostWithDataSchema,
  type SocialPostWithData,
} from "../schemas/social-post";

// Schema for fetch query parameters
const querySchema = z.object({
  entityType: z.string(),
  query: z
    .object({
      id: z.string().optional(), // Slug lookup (used by dynamic route generator)
      platform: z.enum(["linkedin"]).optional(),
      status: z.enum(["draft", "queued", "published", "failed"]).optional(),
      sortByQueue: z.boolean().optional(),
      nextInQueue: z.boolean().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

/**
 * Parse frontmatter and extract body from entity
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
 * DataSource for fetching and transforming social post entities
 * Handles list views, queue management, and filtering by status/platform
 */
export class SocialPostDataSource implements DataSource {
  public readonly id = "social-media:posts";
  public readonly name = "Social Post DataSource";
  public readonly description =
    "Fetches and transforms social post entities for queue management and publishing";

  constructor(private readonly logger: Logger) {
    this.logger.debug("SocialPostDataSource initialized");
  }

  /**
   * Fetch and transform social post entities
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = querySchema.parse(query);
    // Use context.entityService for automatic publishedOnly filtering
    const entityService = context.entityService;

    // Case 1: Fetch next post in queue
    if (params.query?.nextInQueue) {
      return this.fetchNextInQueue(outputSchema, entityService);
    }

    // Case 2: Fetch single post by slug (id param contains the slug)
    if (params.query?.id) {
      return this.fetchBySlug(params.query.id, outputSchema, entityService);
    }

    // Case 3: Fetch list with optional filters
    return this.fetchPostList(
      params.query?.platform,
      params.query?.status,
      params.query?.sortByQueue,
      params.query?.limit,
      params.query?.page,
      params.query?.pageSize,
      params.query?.baseUrl,
      outputSchema,
      entityService,
    );
  }

  /**
   * Fetch the next post in queue (lowest queueOrder with status=queued)
   */
  private async fetchNextInQueue<T>(
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const entities: SocialPost[] = await entityService.listEntities<SocialPost>(
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

  /**
   * Fetch a single post by slug
   */
  private async fetchBySlug<T>(
    slug: string,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const entities: SocialPost[] = await entityService.listEntities<SocialPost>(
      "social-post",
      {
        filter: { metadata: { slug } },
        limit: 1,
      },
    );

    const entity = entities[0];
    if (!entity) {
      throw new Error(`Social post not found with slug: ${slug}`);
    }

    const post = parsePostData(entity);
    return outputSchema.parse({ post });
  }

  /**
   * Fetch list of posts with optional filters and pagination
   */
  private async fetchPostList<T>(
    platform: "linkedin" | undefined,
    status: "draft" | "queued" | "published" | "failed" | undefined,
    sortByQueue: boolean | undefined,
    limit: number | undefined,
    page: number | undefined,
    pageSize: number | undefined,
    baseUrl: string | undefined,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const metadataFilter: Record<string, string> = {};
    if (platform) metadataFilter["platform"] = platform;
    if (status) metadataFilter["status"] = status;
    const hasFilter = Object.keys(metadataFilter).length > 0;

    const sortFields = sortByQueue
      ? [{ field: "queueOrder" as const, direction: "asc" as const }]
      : [{ field: "created" as const, direction: "desc" as const }];

    const currentPage = page ?? 1;
    const itemsPerPage = pageSize ?? limit ?? 100;
    const offset = (currentPage - 1) * itemsPerPage;

    const entities: SocialPost[] = await entityService.listEntities<SocialPost>(
      "social-post",
      {
        ...(hasFilter && { filter: { metadata: metadataFilter } }),
        sortFields,
        limit: itemsPerPage,
        offset,
      },
    );

    let pagination = null;
    if (page !== undefined) {
      const totalItems = await entityService.countEntities("social-post", {
        ...(hasFilter && { filter: { metadata: metadataFilter } }),
      });
      pagination = buildPaginationInfo(totalItems, currentPage, itemsPerPage);
    }

    const posts = entities.map(parsePostData);

    return outputSchema.parse({
      posts,
      totalCount: pagination?.totalItems ?? posts.length,
      pagination,
      baseUrl,
    });
  }
}
