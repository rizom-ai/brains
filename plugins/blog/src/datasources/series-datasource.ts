import type {
  DataSource,
  BaseDataSourceContext,
  IEntityService,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { resolveEntityCoverImage } from "@brains/image";
import { z } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import type { Series } from "../schemas/series";
import {
  blogPostFrontmatterSchema,
  blogPostWithDataSchema,
  type BlogPostWithData,
} from "../schemas/blog-post";
import { seriesFrontmatterSchema } from "../schemas/series";
import { seriesAdapter } from "../adapters/series-adapter";

// Custom query format (used by SeriesRouteGenerator)
const customQuerySchema = z.object({
  type: z.enum(["list", "detail"]),
  seriesName: z.string().optional(),
});

// DynamicRouteGenerator format (entityType + query)
const dynamicQuerySchema = z.object({
  entityType: z.literal("series"),
  query: z
    .object({
      id: z.string().optional(), // slug for detail view
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    })
    .passthrough(),
});

/**
 * Normalize query to a standard format
 * Handles both custom { type, seriesName } and DynamicRouteGenerator { entityType, query } formats
 */
function normalizeQuery(query: unknown): {
  type: "list" | "detail";
  seriesName?: string | undefined;
  seriesSlug?: string | undefined;
} {
  // Try custom format first
  const customResult = customQuerySchema.safeParse(query);
  if (customResult.success) {
    return {
      type: customResult.data.type,
      seriesName: customResult.data.seriesName,
    };
  }

  // Try DynamicRouteGenerator format
  const dynamicResult = dynamicQuerySchema.safeParse(query);
  if (dynamicResult.success) {
    const { query: innerQuery } = dynamicResult.data;
    // If id is provided, it's a detail query (id = slug)
    if (innerQuery.id) {
      return { type: "detail", seriesSlug: innerQuery.id };
    }
    // Otherwise it's a list query
    return { type: "list" };
  }

  // If neither format matches, throw with helpful message
  throw new Error(
    `Invalid series query format. Expected { type: "list" | "detail", seriesName?: string } or { entityType: "series", query: { id?: string } }`,
  );
}

/**
 * Parse frontmatter and extract body from entity
 */
function parsePostData(entity: BlogPost): BlogPostWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterSchema,
  );
  return blogPostWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
  });
}

/**
 * DataSource for fetching series data
 * Uses series entities (auto-derived from posts) for list
 * Uses post entities filtered by seriesName for detail
 */
export class SeriesDataSource implements DataSource {
  public readonly id = "blog:series";
  public readonly name = "Series DataSource";
  public readonly description = "Fetches series list and detail data";

  constructor(private readonly logger: Logger) {
    this.logger.debug("SeriesDataSource initialized");
  }

  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = normalizeQuery(query);
    // Use context.entityService for automatic publishedOnly filtering
    const entityService = context.entityService;

    if (params.type === "list") {
      return this.fetchSeriesList(outputSchema, entityService);
    }

    // params.type === "detail" at this point
    // Need either seriesName or seriesSlug
    if (params.seriesName) {
      return this.fetchSeriesDetail(
        params.seriesName,
        outputSchema,
        entityService,
      );
    }

    if (params.seriesSlug) {
      return this.fetchSeriesDetailBySlug(
        params.seriesSlug,
        outputSchema,
        entityService,
      );
    }

    throw new Error(
      "Invalid series query: must specify seriesName or slug for detail",
    );
  }

  /**
   * Fetch list of all series from series entities
   * Computes postCount dynamically by counting posts per series
   * Resolves cover images using shared utility
   */
  private async fetchSeriesList<T>(
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    // Fetch series entities and posts in parallel
    // Use high limit to ensure all posts are counted
    // publishedOnly filtering is handled by the scoped entityService
    const [seriesEntities, posts] = await Promise.all([
      entityService.listEntities<Series>("series", { limit: 1000 }),
      entityService.listEntities<BlogPost>("post", { limit: 1000 }),
    ]);

    // Count posts per series
    const postCounts = new Map<string, number>();
    for (const post of posts) {
      const seriesName = post.metadata.seriesName;
      if (seriesName) {
        postCounts.set(seriesName, (postCounts.get(seriesName) ?? 0) + 1);
      }
    }

    // Build series list with resolved cover images using shared utility
    const series = await Promise.all(
      seriesEntities.map(async (entity) => {
        const parsed = parseMarkdownWithFrontmatter(
          entity.content,
          seriesFrontmatterSchema,
        );
        const coverImageUrl = await resolveEntityCoverImage(
          entity,
          entityService,
        );

        const body = seriesAdapter.parseBody(entity.content);
        return {
          title: parsed.metadata.title,
          slug: parsed.metadata.slug,
          description: body.description,
          postCount: postCounts.get(parsed.metadata.title) ?? 0,
          coverImageUrl,
        };
      }),
    );

    this.logger.debug(`Found ${series.length} series entities`);

    return outputSchema.parse({ series });
  }

  /**
   * Fetch posts for a specific series
   */
  private async fetchSeriesDetail<T>(
    seriesName: string,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
    seriesEntity?: Series,
  ): Promise<T> {
    // Look up series entity if not provided
    if (!seriesEntity) {
      const seriesEntities = await entityService.listEntities<Series>(
        "series",
        { filter: { metadata: { title: seriesName } } },
      );
      seriesEntity = seriesEntities[0];
    }

    let description: string | undefined;
    let coverImageUrl: string | undefined;

    if (seriesEntity) {
      const body = seriesAdapter.parseBody(seriesEntity.content);
      description = body.description;
      coverImageUrl = await resolveEntityCoverImage(
        seriesEntity,
        entityService,
      );
    }

    // publishedOnly filtering is handled by the scoped entityService
    const posts = await entityService.listEntities<BlogPost>("post", {
      filter: { metadata: { seriesName } },
      sortFields: [{ field: "seriesIndex", direction: "asc" }],
    });

    const postsWithData = posts.map(parsePostData);

    this.logger.debug(`Found ${posts.length} posts in series "${seriesName}"`);

    return outputSchema.parse({
      seriesName,
      posts: postsWithData,
      coverImageUrl,
      description,
    });
  }

  /**
   * Fetch posts for a series by slug
   * Looks up the series name from slug, then delegates to fetchSeriesDetail
   */
  private async fetchSeriesDetailBySlug<T>(
    seriesSlug: string,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    // Look up series entity by slug to get the name
    const seriesEntities = await entityService.listEntities<Series>("series", {
      filter: { metadata: { slug: seriesSlug } },
    });

    const seriesEntity = seriesEntities[0];
    if (!seriesEntity) {
      this.logger.warn(`Series not found with slug: ${seriesSlug}`);
      return outputSchema.parse({
        seriesName: seriesSlug,
        posts: [],
      });
    }

    return this.fetchSeriesDetail(
      seriesEntity.metadata.title,
      outputSchema,
      entityService,
      seriesEntity,
    );
  }
}
