import type { DataSource } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils";
import type { BlogPost, BlogPostFrontmatter } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";

// Schema for fetch query parameters
const entityFetchQuerySchema = z.object({
  entityType: z.string(),
  query: z
    .object({
      id: z.string().optional(),
      latest: z.boolean().optional(),
      "metadata.seriesName": z.string().optional(),
      limit: z.number().optional(),
    })
    .optional(),
});

/**
 * Blog post with parsed frontmatter data
 * Metadata has key fields for fast filtering, frontmatter has all display data
 * Body is the markdown content without frontmatter (for rendering)
 */
export type BlogPostWithData = BlogPost & {
  frontmatter: BlogPostFrontmatter;
  body: string;
};

/**
 * Parse frontmatter and extract body from entity (following summary pattern)
 */
function parsePostData(entity: BlogPost): BlogPostWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );
  return {
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content, // Markdown without frontmatter
  };
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
   */
  async fetch<T>(query: unknown, outputSchema: z.ZodSchema<T>): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);

    // Case 1: Fetch latest published post
    if (params.query?.latest) {
      return this.fetchLatestPost(outputSchema);
    }

    // Case 2: Fetch single post by ID (ID is the slug for human-readable URLs)
    if (params.query?.id) {
      return this.fetchSinglePost(params.query.id, outputSchema);
    }

    // Case 3: Fetch posts in a series
    if (params.query?.["metadata.seriesName"]) {
      return this.fetchSeriesPosts(
        params.query["metadata.seriesName"],
        outputSchema,
      );
    }

    // Case 4: Fetch list of all posts
    return this.fetchPostList(params.query?.limit, outputSchema);
  }

  /**
   * Fetch the latest published blog post
   * Returns in detail format (same as fetchSinglePost) without navigation
   */
  private async fetchLatestPost<T>(outputSchema: z.ZodSchema<T>): Promise<T> {
    const allPosts: BlogPost[] = await this.entityService.listEntities("post", {
      limit: 1000,
    });

    // Find the most recent published post
    const publishedPosts = allPosts.filter((p) => p.metadata.publishedAt);
    if (publishedPosts.length === 0) {
      throw new Error("No published blog posts found");
    }

    // Sort by publishedAt, newest first
    const sortedPosts = publishedPosts.sort((a, b) => {
      const aDate = a.metadata.publishedAt ?? a.created;
      const bDate = b.metadata.publishedAt ?? b.created;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    const latestEntity = sortedPosts[0];
    if (!latestEntity) {
      throw new Error("Failed to retrieve latest blog post");
    }

    const post = parsePostData(latestEntity);

    // For home page, we don't need prev/next navigation
    // But include series posts if this is part of a series
    let seriesPosts = null;
    const seriesName = latestEntity.metadata.seriesName;
    if (seriesName) {
      seriesPosts = allPosts
        .filter(
          (p) => p.metadata.seriesName === seriesName && p.metadata.publishedAt,
        )
        .sort((a, b) => {
          const aIndex = a.metadata.seriesIndex ?? 0;
          const bIndex = b.metadata.seriesIndex ?? 0;
          return aIndex - bIndex;
        })
        .map(parsePostData);
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
   * Fetch a single blog post by ID
   */
  private async fetchSinglePost<T>(
    id: string,
    outputSchema: z.ZodSchema<T>,
  ): Promise<T> {
    const entity: BlogPost | null = await this.entityService.getEntity(
      "post",
      id,
    );

    if (!entity) {
      throw new Error(`Blog post not found: ${id}`);
    }

    // Parse frontmatter for full post data
    const post = parsePostData(entity);

    // For detail view, also fetch prev/next posts and series posts
    const allPosts: BlogPost[] = await this.entityService.listEntities("post", {
      limit: 1000,
    });

    // Sort by publishedAt (from metadata) or created if not published
    const sortedPosts = allPosts.sort((a, b) => {
      const aDate = a.metadata.publishedAt ?? a.created;
      const bDate = b.metadata.publishedAt ?? b.created;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    const currentIndex = sortedPosts.findIndex((p) => p.id === id);
    const prevEntity = currentIndex > 0 ? sortedPosts[currentIndex - 1] : null;
    const nextEntity =
      currentIndex < sortedPosts.length - 1
        ? sortedPosts[currentIndex + 1]
        : null;
    const prevPost = prevEntity ? parsePostData(prevEntity) : null;
    const nextPost = nextEntity ? parsePostData(nextEntity) : null;

    // Get series posts if this is part of a series (using metadata.seriesName)
    let seriesPosts = null;
    const seriesName = entity.metadata.seriesName;
    if (seriesName) {
      seriesPosts = allPosts
        .filter(
          (p) => p.metadata.seriesName === seriesName && p.metadata.publishedAt,
        )
        .sort((a, b) => {
          const aIndex = a.metadata.seriesIndex ?? 0;
          const bIndex = b.metadata.seriesIndex ?? 0;
          return aIndex - bIndex;
        })
        .map(parsePostData);
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
  ): Promise<T> {
    const allPosts: BlogPost[] = await this.entityService.listEntities("post", {
      limit: 1000,
    });

    // Filter and sort using metadata
    const seriesPosts = allPosts
      .filter((p) => p.metadata.seriesName === seriesName)
      .sort((a, b) => {
        const aIndex = a.metadata.seriesIndex ?? 0;
        const bIndex = b.metadata.seriesIndex ?? 0;
        return aIndex - bIndex;
      })
      .map(parsePostData); // Parse frontmatter for full data

    const seriesData = {
      seriesName,
      posts: seriesPosts,
    };

    return outputSchema.parse(seriesData);
  }

  /**
   * Fetch list of all blog posts
   */
  private async fetchPostList<T>(
    limit: number | undefined,
    outputSchema: z.ZodSchema<T>,
  ): Promise<T> {
    const listOptions: Parameters<typeof this.entityService.listEntities>[1] =
      {};
    if (limit !== undefined) {
      listOptions.limit = limit;
    } else {
      listOptions.limit = 1000;
    }

    const entities: BlogPost[] = await this.entityService.listEntities(
      "post",
      listOptions,
    );

    // Sort by publishedAt (from metadata), newest first
    // Published posts come before unpublished
    const sortedPosts = entities.sort((a, b) => {
      const aPublished = a.metadata.publishedAt;
      const bPublished = b.metadata.publishedAt;

      // If both published or both unpublished, sort by date
      if ((aPublished && bPublished) || (!aPublished && !bPublished)) {
        const aDate = aPublished ?? a.created;
        const bDate = bPublished ?? b.created;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      }

      // Published posts come before unpublished
      return aPublished ? -1 : 1;
    });

    // Parse frontmatter for full data
    const postsWithData = sortedPosts.map(parsePostData);

    const listData = {
      posts: postsWithData,
    };

    return outputSchema.parse(listData);
  }
}
