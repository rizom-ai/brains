import type {
  DataSource,
  BaseDataSourceContext,
  IEntityService,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  parseMarkdownWithFrontmatter,
  buildPaginationInfo,
} from "@brains/plugins";
import { z, slugify } from "@brains/utils";
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
 * Includes seriesUrl if the post belongs to a series
 */
function parsePostData(
  entity: BlogPost,
): BlogPostWithData & { seriesUrl?: string } {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );

  // Compute series URL if post belongs to a series
  const seriesName = parsed.metadata.seriesName;
  const seriesUrl = seriesName ? `/series/${slugify(seriesName)}` : undefined;

  // Use schema to validate and parse
  return {
    ...blogPostWithDataSchema.parse({
      ...entity,
      frontmatter: parsed.metadata,
      body: parsed.content, // Markdown without frontmatter
    }),
    ...(seriesUrl && { seriesUrl }),
  };
}

/**
 * Resolve cover image for a single post
 * Fetches the image entity and returns its data URL
 */
async function resolvePostCoverImage<T extends BlogPostWithData>(
  post: T,
  entityService: IEntityService,
): Promise<T> {
  const coverImageId = post.frontmatter.coverImageId;
  if (!coverImageId) {
    return post;
  }

  // Image entities store the data URL in their content field
  const image = await entityService.getEntity("image", coverImageId);
  if (!image) {
    return post;
  }

  return {
    ...post,
    coverImageUrl: image.content,
  };
}

/**
 * Resolve cover images for multiple posts
 */
async function resolvePostsCoverImages<T extends BlogPostWithData>(
  posts: T[],
  entityService: IEntityService,
): Promise<T[]> {
  return Promise.all(
    posts.map((post) => resolvePostCoverImage(post, entityService)),
  );
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

    let post = parsePostData(latestEntity);
    // Resolve cover image (inline images resolved by site-builder)
    post = await resolvePostCoverImage(post, entityService);

    // For home page, we don't need prev/next navigation
    // But include series posts if this is part of a series
    let seriesPosts = null;
    const seriesName = latestEntity.metadata.seriesName;
    if (seriesName) {
      const seriesEntities: BlogPost[] =
        await entityService.listEntities<BlogPost>("post", {
          limit: 100,
          filter: { metadata: { seriesName } },
          sortFields: [{ field: "seriesIndex", direction: "asc" }],
        });
      const parsedSeriesPosts = seriesEntities.map(parsePostData);
      seriesPosts = await resolvePostsCoverImages(
        parsedSeriesPosts,
        entityService,
      );
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

    // Parse frontmatter for full post data and resolve cover image
    // (inline images resolved by site-builder)
    let post = parsePostData(entity);
    post = await resolvePostCoverImage(post, entityService);

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
    let prevPost = prevEntity ? parsePostData(prevEntity) : null;
    let nextPost = nextEntity ? parsePostData(nextEntity) : null;
    // Resolve cover images for prev/next posts
    if (prevPost) {
      prevPost = await resolvePostCoverImage(prevPost, entityService);
    }
    if (nextPost) {
      nextPost = await resolvePostCoverImage(nextPost, entityService);
    }

    // Get series posts if this is part of a series
    let seriesPosts = null;
    const seriesName = entity.metadata.seriesName;
    if (seriesName) {
      const seriesEntities: BlogPost[] =
        await entityService.listEntities<BlogPost>("post", {
          limit: 100,
          filter: { metadata: { seriesName } },
          sortFields: [{ field: "seriesIndex", direction: "asc" }],
        });
      const parsedSeriesPosts = seriesEntities.map(parsePostData);
      seriesPosts = await resolvePostsCoverImages(
        parsedSeriesPosts,
        entityService,
      );
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
    entityService: IEntityService,
  ): Promise<T> {
    const seriesEntities: BlogPost[] =
      await entityService.listEntities<BlogPost>("post", {
        limit: 100,
        filter: { metadata: { seriesName } },
        sortFields: [{ field: "seriesIndex", direction: "asc" }],
      });

    const parsedPosts = seriesEntities.map(parsePostData);
    const seriesPosts = await resolvePostsCoverImages(
      parsedPosts,
      entityService,
    );

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

    // Parse frontmatter for full data and resolve cover images
    const parsedPosts = entities.map(parsePostData);
    const postsWithData = await resolvePostsCoverImages(
      parsedPosts,
      entityService,
    );

    const listData = {
      posts: postsWithData,
      pagination,
      baseUrl, // Pass through for pagination component
    };

    return outputSchema.parse(listData);
  }
}
