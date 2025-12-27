import {
  type DataSource,
  type BaseDataSourceContext,
  buildPaginationInfo,
} from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import {
  blogPostFrontmatterSchema,
  blogPostWithDataSchema,
  type BlogPostWithData,
} from "../schemas/blog-post";

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

/**
 * Parse frontmatter and extract body from entity
 * Uses Zod schema to validate the output
 */
function parsePostData(entity: BlogPost): BlogPostWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );

  // Use schema to validate and parse
  return blogPostWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content, // Markdown without frontmatter
  });
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

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
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

    // Case 1: Fetch latest published post
    if (params.query?.latest) {
      return this.fetchLatestPost(outputSchema, context);
    }

    // Case 2: Fetch single post by slug (for human-readable URLs)
    if (params.query?.id) {
      return this.fetchSinglePost(params.query.id, outputSchema, context);
    }

    // Case 3: Fetch posts in a series
    if (params.query?.["metadata.seriesName"]) {
      return this.fetchSeriesPosts(
        params.query["metadata.seriesName"],
        outputSchema,
        context,
      );
    }

    // Case 4: Fetch list of all posts (with optional pagination)
    return this.fetchPostList(
      params.query?.limit,
      params.query?.page,
      params.query?.pageSize,
      params.query?.baseUrl,
      outputSchema,
      context,
    );
  }

  /**
   * Fetch the latest published blog post
   * Returns in detail format (same as fetchSinglePost) without navigation
   * Throws error if no published posts exist (site builder will skip section)
   */
  private async fetchLatestPost<T>(
    outputSchema: z.ZodSchema<T>,
    _context: BaseDataSourceContext,
  ): Promise<T> {
    // Get the latest published post using database-level sorting
    const publishedPosts: BlogPost[] =
      await this.entityService.listEntities<BlogPost>("post", {
        limit: 1,
        publishedOnly: true,
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

    // For home page, we don't need prev/next navigation
    // But include series posts if this is part of a series
    let seriesPosts = null;
    const seriesName = latestEntity.metadata.seriesName;
    if (seriesName) {
      const seriesEntities: BlogPost[] =
        await this.entityService.listEntities<BlogPost>("post", {
          limit: 100,
          publishedOnly: true,
          filter: { metadata: { seriesName } },
          sortFields: [{ field: "seriesIndex", direction: "asc" }],
        });
      seriesPosts = seriesEntities.map(parsePostData);
    }

    const detailData = {
      post,
      prevPost: null, // No navigation on home page
      nextPost: null,
      seriesPosts, // Keep series info if available
    };

    return outputSchema.parse(detailData);
  }

  /**
   * Fetch a single blog post by slug
   */
  private async fetchSinglePost<T>(
    slug: string,
    outputSchema: z.ZodSchema<T>,
    _context: BaseDataSourceContext,
  ): Promise<T> {
    // Query by slug in metadata
    const entities: BlogPost[] =
      await this.entityService.listEntities<BlogPost>("post", {
        filter: {
          metadata: {
            slug,
          },
        },
        limit: 1,
      });

    const entity = entities[0];
    if (!entity) {
      throw new Error(`Blog post not found with slug: ${slug}`);
    }

    // Parse frontmatter for full post data
    const post = parsePostData(entity);

    // For detail view, fetch posts sorted for prev/next navigation
    const sortedPosts: BlogPost[] =
      await this.entityService.listEntities<BlogPost>("post", {
        limit: 1000,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      });

    const currentIndex = sortedPosts.findIndex((p) => p.id === entity.id);
    const prevEntity = currentIndex > 0 ? sortedPosts[currentIndex - 1] : null;
    const nextEntity =
      currentIndex < sortedPosts.length - 1
        ? sortedPosts[currentIndex + 1]
        : null;
    const prevPost = prevEntity ? parsePostData(prevEntity) : null;
    const nextPost = nextEntity ? parsePostData(nextEntity) : null;

    // Get series posts if this is part of a series
    let seriesPosts = null;
    const seriesName = entity.metadata.seriesName;
    if (seriesName) {
      const seriesEntities: BlogPost[] =
        await this.entityService.listEntities<BlogPost>("post", {
          limit: 100,
          publishedOnly: true,
          filter: { metadata: { seriesName } },
          sortFields: [{ field: "seriesIndex", direction: "asc" }],
        });
      seriesPosts = seriesEntities.map(parsePostData);
    }

    const detailData = {
      post,
      prevPost,
      nextPost,
      seriesPosts,
    };

    return outputSchema.parse(detailData);
  }

  /**
   * Fetch all posts in a series
   */
  private async fetchSeriesPosts<T>(
    seriesName: string,
    outputSchema: z.ZodSchema<T>,
    _context: BaseDataSourceContext,
  ): Promise<T> {
    const seriesEntities: BlogPost[] =
      await this.entityService.listEntities<BlogPost>("post", {
        limit: 100,
        filter: { metadata: { seriesName } },
        sortFields: [{ field: "seriesIndex", direction: "asc" }],
      });

    const seriesPosts = seriesEntities.map(parsePostData);

    const seriesData = {
      seriesName,
      posts: seriesPosts,
    };

    return outputSchema.parse(seriesData);
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
    context: BaseDataSourceContext,
  ): Promise<T> {
    const currentPage = page ?? 1;
    const itemsPerPage = pageSize ?? limit ?? 10;
    const offset = (currentPage - 1) * itemsPerPage;

    // Fetch posts with database-level sorting, filtering, and pagination
    const entities: BlogPost[] =
      await this.entityService.listEntities<BlogPost>("post", {
        limit: itemsPerPage,
        offset,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
        ...(context.publishedOnly !== undefined && {
          publishedOnly: context.publishedOnly,
        }),
      });

    // Get total count for pagination info (only if page is specified)
    let pagination = null;
    if (page !== undefined) {
      const totalItems = await this.entityService.countEntities("post", {
        ...(context.publishedOnly !== undefined && {
          publishedOnly: context.publishedOnly,
        }),
      });
      pagination = buildPaginationInfo(totalItems, currentPage, itemsPerPage);
    }

    // Parse frontmatter for full data
    const postsWithData = entities.map(parsePostData);

    const listData = {
      posts: postsWithData,
      pagination,
      baseUrl, // Pass through for pagination component
    };

    return outputSchema.parse(listData);
  }
}
