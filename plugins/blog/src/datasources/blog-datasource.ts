import {
  BaseEntityDataSource,
  baseQuerySchema,
  baseInputSchema,
  type BaseQuery,
  type NavigationResult,
  type PaginationInfo,
} from "@brains/plugins";
import type { BaseDataSourceContext, IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z, slugify } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import type { BlogPostWithData } from "../schemas/blog-post";
import { parsePostData as parsePostDataBase } from "./parse-helpers";

// Re-export for convenience
export type { BlogPostWithData };

type BlogPostTransformed = BlogPostWithData & { seriesUrl?: string };

const blogQuerySchema = baseQuerySchema.extend({
  latest: z.boolean().optional(),
  "metadata.seriesName": z.string().optional(),
});

const blogInputSchema = baseInputSchema.extend({
  query: blogQuerySchema.optional(),
});

type BlogQuery = z.infer<typeof blogQuerySchema>;

interface BlogDetailData {
  post: BlogPostTransformed;
  prevPost: BlogPostTransformed | null;
  nextPost: BlogPostTransformed | null;
  seriesPosts: BlogPostTransformed[] | null;
}

interface BlogListData {
  posts: BlogPostTransformed[];
  pagination: PaginationInfo | null;
  baseUrl: string | undefined;
}

function parsePostData(entity: BlogPost): BlogPostTransformed {
  const post = parsePostDataBase(entity);
  const seriesName = post.frontmatter.seriesName;
  const seriesUrl = seriesName ? `/series/${slugify(seriesName)}` : undefined;
  return { ...post, ...(seriesUrl && { seriesUrl }) };
}

/**
 * DataSource for fetching and transforming blog post entities.
 * Handles list views, detail views, series views, and latest post.
 */
export class BlogDataSource extends BaseEntityDataSource<
  BlogPost,
  BlogPostTransformed
> {
  readonly id = "blog:entities";
  readonly name = "Blog Entity DataSource";
  readonly description =
    "Fetches and transforms blog post entities for rendering";

  protected readonly config = {
    entityType: "post",
    defaultSort: [
      { field: "publishedAt" as const, direction: "desc" as const },
    ],
    defaultLimit: 10,
    enableNavigation: true,
  };

  constructor(logger: Logger) {
    super(logger);
    this.logger.debug("BlogDataSource initialized");
  }

  protected override parseQuery(query: unknown): {
    entityType: string;
    query: BlogQuery;
  } {
    const parsed = blogInputSchema.parse(query);
    return {
      entityType: parsed.entityType ?? this.config.entityType,
      query: parsed.query ?? {},
    };
  }

  protected transformEntity(entity: BlogPost): BlogPostTransformed {
    return parsePostData(entity);
  }

  protected override buildDetailResult(
    item: BlogPostTransformed,
    navigation: NavigationResult<BlogPostTransformed> | null,
  ): BlogDetailData {
    // Note: seriesPosts is added in the overridden fetch for detail views
    return {
      post: item,
      prevPost: navigation?.prev ?? null,
      nextPost: navigation?.next ?? null,
      seriesPosts: null as BlogPostTransformed[] | null,
    };
  }

  protected buildListResult(
    items: BlogPostTransformed[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): BlogListData {
    return {
      posts: items,
      pagination,
      baseUrl: query.baseUrl,
    };
  }

  /**
   * Override fetch to handle custom query cases: latest and series.
   * Standard list/detail flows delegate to the base class.
   */
  override async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const { query: parsedQuery } = this.parseQuery(query);
    const entityService = context.entityService;

    // Case 1: Fetch latest published post
    if (parsedQuery.latest) {
      return this.fetchLatestPost(outputSchema, entityService);
    }

    // Case 2: Fetch single post by slug — custom because it enriches with seriesPosts
    if (parsedQuery.id) {
      return this.fetchSinglePost(parsedQuery.id, outputSchema, entityService);
    }

    // Case 3: Fetch posts in a series
    if (parsedQuery["metadata.seriesName"]) {
      return this.fetchSeriesPosts(
        parsedQuery["metadata.seriesName"],
        outputSchema,
        entityService,
      );
    }

    // Case 4: Standard paginated list — delegate to base class
    return super.fetch(query, outputSchema, context);
  }

  // ── Custom cases ──

  /**
   * Fetch the latest published blog post.
   * Returns in detail format without navigation.
   */
  private async fetchLatestPost<T>(
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const publishedPosts = await entityService.listEntities<BlogPost>(
      this.config.entityType,
      {
        limit: 1,
        sortFields: [{ field: "publishedAt", direction: "desc" }],
      },
    );

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

    return outputSchema.parse({
      post,
      prevPost: null,
      nextPost: null,
      seriesPosts,
    });
  }

  /**
   * Fetch a single blog post by slug with prev/next navigation and series context.
   * Parallelizes navigation and series fetch after the initial entity lookup.
   */
  private async fetchSinglePost<T>(
    slug: string,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    // Look up the entity first (needed to know seriesName and for navigation)
    const entity = await this.lookupEntity(slug, entityService);
    const item = this.transformEntity(entity);

    // Navigation and series fetch are independent — run in parallel
    const [navigation, seriesPosts] = await Promise.all([
      this.config.enableNavigation
        ? this.resolveNavigation(entity, entityService)
        : Promise.resolve(null),
      item.frontmatter.seriesName
        ? this.fetchPostsBySeries(item.frontmatter.seriesName, entityService)
        : Promise.resolve(null),
    ]);

    return outputSchema.parse({
      post: item,
      prevPost: navigation?.prev ?? null,
      nextPost: navigation?.next ?? null,
      seriesPosts,
    });
  }

  private async fetchPostsBySeries(
    seriesName: string,
    entityService: IEntityService,
  ): Promise<BlogPostTransformed[]> {
    const entities = await entityService.listEntities<BlogPost>(
      this.config.entityType,
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
  ): Promise<BlogPostTransformed[] | null> {
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
}
