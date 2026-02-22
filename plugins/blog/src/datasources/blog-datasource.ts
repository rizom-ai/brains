import type {
  DataSource,
  BaseDataSourceContext,
  IEntityService,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { buildPaginationInfo } from "@brains/plugins";
import { z, slugify } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import type { BlogPostWithData } from "../schemas/blog-post";
import { parsePostData as parsePostDataBase } from "./parse-helpers";

// Schema for fetch query parameters
const entityFetchQuerySchema = z.object({
  entityType: z.string(),
  query: z
    .object({
      id: z.string().optional(),
      latest: z.boolean().optional(),
      "metadata.seriesName": z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      baseUrl: z.string().optional(), // For pagination links
    })
    .optional(),
});

// Re-export for convenience
export type { BlogPostWithData };

function parsePostData(
  entity: BlogPost,
): BlogPostWithData & { seriesUrl?: string } {
  const post = parsePostDataBase(entity);
  const seriesName = post.frontmatter.seriesName;
  const seriesUrl = seriesName ? `/series/${slugify(seriesName)}` : undefined;
  return { ...post, ...(seriesUrl && { seriesUrl }) };
}

/**
 * DataSource for fetching and transforming blog post entities
 * Handles list views, detail views, and series views for blog posts
 */
export class BlogDataSource implements DataSource {
  public readonly id = "blog:entities";
  public readonly name = "Blog Entity DataSource";
  public readonly description =
    "Fetches and transforms blog post entities for rendering";

  constructor(private readonly logger: Logger) {
    this.logger.debug("BlogDataSource initialized");
  }

  /**
   * Fetch and transform blog post entities to template-ready format
   * @param context - Context with environment and URL generation
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);
    // Use context.entityService for automatic publishedOnly filtering
    const entityService = context.entityService;

    // Case 1: Fetch latest published post
    if (params.query?.latest) {
      return this.fetchLatestPost(outputSchema, entityService);
    }

    // Case 2: Fetch single post by slug (for human-readable URLs)
    if (params.query?.id) {
      return this.fetchSinglePost(params.query.id, outputSchema, entityService);
    }

    // Case 3: Fetch posts in a series
    if (params.query?.["metadata.seriesName"]) {
      return this.fetchSeriesPosts(
        params.query["metadata.seriesName"],
        outputSchema,
        entityService,
      );
    }

    // Case 4: Fetch list of all posts (with optional pagination)
    return this.fetchPostList(
      params.query?.limit,
      params.query?.page,
      params.query?.pageSize,
      params.query?.baseUrl,
      outputSchema,
      entityService,
    );
  }

  /**
   * Fetch the latest published blog post
   * Returns in detail format (same as fetchSinglePost) without navigation
   * Throws error if no published posts exist (site builder will skip section)
   */
  private async fetchLatestPost<T>(
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    // Get the latest published post using database-level sorting
    const publishedPosts: BlogPost[] =
      await entityService.listEntities<BlogPost>("post", {
        limit: 1,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      });

    if (publishedPosts.length === 0) {
      this.logger.info("No published blog posts found for homepage");
      throw new Error("NO_PUBLISHED_POSTS");
    }

    const latestEntity = publishedPosts[0];
    if (!latestEntity) {
      throw new Error("Failed to retrieve latest blog post");
    }

    const post = parsePostData(latestEntity);
    const seriesPosts = await this.fetchSeriesPostsForEntity(
      latestEntity,
      entityService,
    );

    const detailData = {
      post,
      prevPost: null,
      nextPost: null,
      seriesPosts,
    };

    return outputSchema.parse(detailData);
  }

  /**
   * Fetch a single blog post by slug
   */
  private async fetchSinglePost<T>(
    slug: string,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    // Query by slug in metadata
    const entities: BlogPost[] = await entityService.listEntities<BlogPost>(
      "post",
      {
        filter: {
          metadata: {
            slug,
          },
        },
        limit: 1,
      },
    );

    const entity = entities[0];
    if (!entity) {
      throw new Error(`Blog post not found with slug: ${slug}`);
    }

    // Parse frontmatter for full post data
    // Cover images resolved by site-builder enrichWithUrls
    const post = parsePostData(entity);

    // For detail view, fetch posts sorted for prev/next navigation
    const sortedPosts: BlogPost[] = await entityService.listEntities<BlogPost>(
      "post",
      {
        limit: 1000,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      },
    );

    const currentIndex = sortedPosts.findIndex((p) => p.id === entity.id);
    const prevEntity = currentIndex > 0 ? sortedPosts[currentIndex - 1] : null;
    const nextEntity =
      currentIndex < sortedPosts.length - 1
        ? sortedPosts[currentIndex + 1]
        : null;
    const prevPost = prevEntity ? parsePostData(prevEntity) : null;
    const nextPost = nextEntity ? parsePostData(nextEntity) : null;
    const seriesPosts = await this.fetchSeriesPostsForEntity(
      entity,
      entityService,
    );

    const detailData = {
      post,
      prevPost,
      nextPost,
      seriesPosts,
    };

    return outputSchema.parse(detailData);
  }

  private async fetchPostsBySeries(
    seriesName: string,
    entityService: IEntityService,
  ): Promise<(BlogPostWithData & { seriesUrl?: string })[]> {
    const entities: BlogPost[] = await entityService.listEntities<BlogPost>(
      "post",
      {
        limit: 100,
        filter: { metadata: { seriesName } },
        sortFields: [{ field: "seriesIndex", direction: "asc" }],
      },
    );
    return entities.map(parsePostData);
  }

  private async fetchSeriesPostsForEntity(
    entity: BlogPost,
    entityService: IEntityService,
  ): Promise<(BlogPostWithData & { seriesUrl?: string })[] | null> {
    const seriesName = entity.metadata.seriesName;
    if (!seriesName) return null;
    return this.fetchPostsBySeries(seriesName, entityService);
  }

  private async fetchSeriesPosts<T>(
    seriesName: string,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const posts = await this.fetchPostsBySeries(seriesName, entityService);
    return outputSchema.parse({ seriesName, posts });
  }

  /**
   * Fetch list of all blog posts with optional pagination
   */
  private async fetchPostList<T>(
    limit: number | undefined,
    page: number | undefined,
    pageSize: number | undefined,
    baseUrl: string | undefined,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const currentPage = page ?? 1;
    const itemsPerPage = pageSize ?? limit ?? 10;
    const offset = (currentPage - 1) * itemsPerPage;

    // Fetch posts with database-level sorting, filtering, and pagination
    // publishedOnly filtering is handled by the scoped entityService
    const entities: BlogPost[] = await entityService.listEntities<BlogPost>(
      "post",
      {
        limit: itemsPerPage,
        offset,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      },
    );

    // Get total count for pagination info (only if page is specified)
    let pagination = null;
    if (page !== undefined) {
      const totalItems = await entityService.countEntities("post");
      pagination = buildPaginationInfo(totalItems, currentPage, itemsPerPage);
    }

    // Parse frontmatter for full data
    // Cover images resolved by site-builder enrichWithUrls
    const postsWithData = entities.map(parsePostData);

    const listData = {
      posts: postsWithData,
      pagination,
      baseUrl, // Pass through for pagination component
    };

    return outputSchema.parse(listData);
  }
}
