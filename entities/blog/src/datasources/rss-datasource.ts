import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { z as zMain } from "@brains/utils/zod";
import { z } from "@brains/utils/zod-v4";
import type { BlogPost } from "../schemas/blog-post";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import type { BlogPostWithData } from "./blog-datasource";
import { generateRSSFeed, type RSSFeedConfig } from "../rss/feed-generator";

/**
 * RSS feed query schema
 */
const rssFeedQuerySchema = z.object({
  siteUrl: z.url(),
  title: z.string(),
  description: z.string(),
  language: z.string().optional(),
  copyright: z.string().optional(),
});

type RSSFeedQuery = z.output<typeof rssFeedQuerySchema>;

/**
 * DataSource for generating RSS feed from blog posts
 */
export class RSSDataSource implements DataSource {
  private readonly logger: Logger;
  public readonly id = "blog:rss";
  public readonly name = "Blog RSS Feed DataSource";
  public readonly description =
    "Generates RSS 2.0 feed XML from published blog posts";

  constructor(logger: Logger) {
    this.logger = logger;
    this.logger.debug("RSSDataSource initialized");
  }

  /**
   * Fetch and generate RSS feed XML
   * @param context - Optional context (environment, etc.)
   */
  async fetch<T>(
    query: unknown,
    outputSchema: zMain.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    // Parse query parameters
    const params: RSSFeedQuery = rssFeedQuerySchema.parse(query);
    // Use context.entityService for automatic publishedOnly filtering
    const entityService = context.entityService;

    // Fetch all published posts
    const allPosts: BlogPost[] = await entityService.listEntities({
      entityType: "post",
      options: {
        limit: 1000,
      },
    });

    // Filter only published posts and parse frontmatter
    const publishedPosts: BlogPostWithData[] = allPosts
      .filter(
        (p) => p.metadata.status === "published" && p.metadata.publishedAt,
      )
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

    this.logger.debug(
      `Generating RSS feed with ${publishedPosts.length} posts`,
    );

    // Build RSS config
    const rssConfig: RSSFeedConfig = {
      title: params.title,
      description: params.description,
      link: params.siteUrl,
      language: params.language ?? "en-us",
      ...(params.copyright && { copyright: params.copyright }),
    };

    // Generate RSS XML
    const xml = generateRSSFeed(publishedPosts, rssConfig);

    const result = {
      xml,
    };

    return outputSchema.parse(result);
  }
}
