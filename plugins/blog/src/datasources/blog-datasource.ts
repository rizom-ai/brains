import type { DataSource } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";

// Schema for fetch query parameters
const entityFetchQuerySchema = z.object({
  entityType: z.string(),
  query: z
    .object({
      id: z.string().optional(),
      "metadata.seriesName": z.string().optional(),
      limit: z.number().optional(),
    })
    .optional(),
});

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

    // Case 1: Fetch single post by ID (ID is the slug for human-readable URLs)
    if (params.query?.id) {
      return this.fetchSinglePost(params.query.id, outputSchema);
    }

    // Case 2: Fetch posts in a series
    if (params.query?.["metadata.seriesName"]) {
      return this.fetchSeriesPosts(
        params.query["metadata.seriesName"],
        outputSchema,
      );
    }

    // Case 3: Fetch list of all posts
    return this.fetchPostList(params.query?.limit, outputSchema);
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

    // For detail view, also fetch prev/next posts and series posts
    const allPosts: BlogPost[] = await this.entityService.listEntities("post", {
      limit: 1000,
    });

    // Sort by publishedAt (or created if not published)
    const sortedPosts = allPosts.sort((a, b) => {
      const aDate = a.metadata.publishedAt ?? a.created;
      const bDate = b.metadata.publishedAt ?? b.created;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    const currentIndex = sortedPosts.findIndex((p) => p.id === id);
    const prevPost = currentIndex > 0 ? sortedPosts[currentIndex - 1] : null;
    const nextPost =
      currentIndex < sortedPosts.length - 1
        ? sortedPosts[currentIndex + 1]
        : null;

    // Get series posts if this is part of a series
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
        });
    }

    const detailData = {
      post: entity,
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

    const seriesPosts = allPosts
      .filter((p) => p.metadata.seriesName === seriesName)
      .sort((a, b) => {
        const aIndex = a.metadata.seriesIndex ?? 0;
        const bIndex = b.metadata.seriesIndex ?? 0;
        return aIndex - bIndex;
      });

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

    // Sort by publishedAt (published first), then by created date, newest first
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

    const listData = {
      posts: sortedPosts,
    };

    return outputSchema.parse(listData);
  }
}
