import type { DataSource } from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { z } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { blogPostFrontmatterSchema } from "../schemas/blog-post";
import type { BlogPostWithData } from "./blog-datasource";
import { generateRSSFeed, type RSSFeedConfig } from "../rss/feed-generator";

/**
 * RSS feed query schema
 */
const rssFeedQuerySchema = z.object({
  siteUrl: z.string().url(),
  title: z.string(),
  description: z.string(),
  language: z.string().optional(),
  copyright: z.string().optional(),
});

/**
 * DataSource for generating RSS feed from blog posts
 */
export class RSSDataSource implements DataSource {
  public readonly id = "blog:rss";
  public readonly name = "Blog RSS Feed DataSource";
  public readonly description =
    "Generates RSS 2.0 feed XML from published blog posts";

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.logger.debug("RSSDataSource initialized");
  }

  /**
   * Fetch and generate RSS feed XML
   */
  async fetch<T>(query: unknown, outputSchema: z.ZodSchema<T>): Promise<T> {
    // Parse query parameters
    const params = rssFeedQuerySchema.parse(query);

    // Fetch all published posts
    const allPosts: BlogPost[] = await this.entityService.listEntities("post", {
      limit: 1000,
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
