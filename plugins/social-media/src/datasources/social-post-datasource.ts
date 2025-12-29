import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
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
      slug: z.string().optional(),
      platform: z.enum(["linkedin"]).optional(),
      status: z.enum(["draft", "queued", "published", "failed"]).optional(),
      sortByQueue: z.boolean().optional(),
      nextInQueue: z.boolean().optional(),
      limit: z.number().optional(),
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

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.logger.debug("SocialPostDataSource initialized");
  }

  /**
   * Fetch and transform social post entities
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    _context?: BaseDataSourceContext,
  ): Promise<T> {
    const params = querySchema.parse(query);

    // Case 1: Fetch next post in queue
    if (params.query?.nextInQueue) {
      return this.fetchNextInQueue(outputSchema);
    }

    // Case 2: Fetch single post by slug
    if (params.query?.slug) {
      return this.fetchBySlug(params.query.slug, outputSchema);
    }

    // Case 3: Fetch list with optional filters
    return this.fetchPostList(
      params.query?.platform,
      params.query?.status,
      params.query?.sortByQueue,
      params.query?.limit,
      outputSchema,
    );
  }

  /**
   * Fetch the next post in queue (lowest queueOrder with status=queued)
   */
  private async fetchNextInQueue<T>(outputSchema: z.ZodSchema<T>): Promise<T> {
    const entities: SocialPost[] =
      await this.entityService.listEntities<SocialPost>("social-post", {
        filter: { metadata: { status: "queued" } },
        sortFields: [{ field: "queueOrder", direction: "asc" }],
        limit: 1,
      });

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
  ): Promise<T> {
    const entities: SocialPost[] =
      await this.entityService.listEntities<SocialPost>("social-post", {
        filter: { metadata: { slug } },
        limit: 1,
      });

    const entity = entities[0];
    if (!entity) {
      throw new Error(`Social post not found with slug: ${slug}`);
    }

    const post = parsePostData(entity);
    return outputSchema.parse({ post });
  }

  /**
   * Fetch list of posts with optional filters
   */
  private async fetchPostList<T>(
    platform: "linkedin" | undefined,
    status: "draft" | "queued" | "published" | "failed" | undefined,
    sortByQueue: boolean | undefined,
    limit: number | undefined,
    outputSchema: z.ZodSchema<T>,
  ): Promise<T> {
    // Build filter from query params
    const metadataFilter: Record<string, string> = {};
    if (platform) {
      metadataFilter["platform"] = platform;
    }
    if (status) {
      metadataFilter["status"] = status;
    }

    const hasFilter = Object.keys(metadataFilter).length > 0;

    // Determine sort order
    const sortFields = sortByQueue
      ? [{ field: "queueOrder" as const, direction: "asc" as const }]
      : [{ field: "created" as const, direction: "desc" as const }];

    const entities: SocialPost[] =
      await this.entityService.listEntities<SocialPost>("social-post", {
        ...(hasFilter && { filter: { metadata: metadataFilter } }),
        sortFields,
        limit: limit ?? 100,
      });

    const posts = entities.map(parsePostData);

    return outputSchema.parse({
      posts,
      totalCount: posts.length,
    });
  }
}
