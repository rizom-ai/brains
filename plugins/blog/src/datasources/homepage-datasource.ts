import type { DataSource, DataSourceContext } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import type { BlogPostWithData } from "./blog-datasource";

const homepageQuerySchema = z.object({}).passthrough();

/**
 * Homepage DataSource
 * Returns latest published blog post if available, otherwise returns HOME.md content
 * On preview builds, shows latest post regardless of status
 * On production builds, shows only published posts
 */
export class HomepageDataSource implements DataSource {
  public readonly id = "blog:homepage";
  public readonly name = "Homepage DataSource";
  public readonly description =
    "Returns latest blog post or HOME.md fallback for homepage";

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.logger.debug("HomepageDataSource initialized");
  }

  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context?: DataSourceContext,
  ): Promise<T> {
    this.logger.info(`Homepage datasource query: ${JSON.stringify(query)}`);
    this.logger.info(`Homepage datasource context: ${JSON.stringify(context)}`);

    // Parse query (currently empty schema, but keeping for future extensibility)
    homepageQuerySchema.parse(query);
    const isPreview = context?.environment === "preview";

    this.logger.info(
      `Fetching homepage content (environment: ${context?.environment}, isPreview: ${isPreview})`,
    );

    // Get all posts
    const allPosts: BlogPost[] = await this.entityService.listEntities("post", {
      limit: 1000,
    });

    // Filter based on environment
    // Preview: show any post (draft or published)
    // Production: show only published posts
    const filteredPosts = isPreview
      ? allPosts
      : allPosts.filter((p) => p.metadata.publishedAt);

    const publishedPosts = filteredPosts;

    // If we have published posts, return the latest one
    if (publishedPosts.length > 0) {
      const sortedPosts = publishedPosts.sort((a, b) => {
        const aDate = a.metadata.publishedAt ?? a.created;
        const bDate = b.metadata.publishedAt ?? b.created;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

      const latestEntity = sortedPosts[0];
      if (!latestEntity) {
        throw new Error("Failed to retrieve latest blog post");
      }

      const parsed = parseMarkdownWithFrontmatter(
        latestEntity.content,
        blogPostFrontmatterSchema,
      );
      const post: BlogPostWithData = {
        ...latestEntity,
        frontmatter: parsed.metadata,
        body: parsed.content,
      };

      // Get series posts if applicable
      let seriesPosts = null;
      const seriesName = latestEntity.metadata.seriesName;
      if (seriesName) {
        seriesPosts = allPosts
          .filter(
            (p) =>
              p.metadata.seriesName === seriesName && p.metadata.publishedAt,
          )
          .sort((a, b) => {
            const aIndex = a.metadata.seriesIndex ?? 0;
            const bIndex = b.metadata.seriesIndex ?? 0;
            return aIndex - bIndex;
          })
          .map((entity) => {
            const parsed = parseMarkdownWithFrontmatter(
              entity.content,
              blogPostFrontmatterSchema,
            );
            return {
              ...entity,
              frontmatter: parsed.metadata,
              body: parsed.content,
            };
          });
      }

      const postData = {
        type: "post" as const,
        post,
        prevPost: null,
        nextPost: null,
        seriesPosts,
      };

      return outputSchema.parse(postData);
    }

    // No published posts - return HOME.md content
    this.logger.info("No published posts found, falling back to HOME.md");
    const homeEntity = await this.entityService.getEntity("base", "HOME");

    if (!homeEntity) {
      throw new Error("Neither published posts nor HOME.md found for homepage");
    }

    const homeData = {
      type: "markdown" as const,
      content: homeEntity.content,
    };

    return outputSchema.parse(homeData);
  }
}
