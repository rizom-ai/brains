import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import { blogPostSchema, enrichedBlogPostSchema } from "./schemas/blog-post";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import { createGenerateTool } from "./tools/generate";
import { createPublishTool } from "./tools/publish";
import { createGenerateRSSTool } from "./tools/generate-rss";
import type { BlogConfig } from "./config";
import { blogConfigSchema } from "./config";
import { BlogListTemplate, type BlogListProps } from "./templates/blog-list";
import { BlogPostTemplate, type BlogPostProps } from "./templates/blog-post";
import {
  SeriesListTemplate,
  type SeriesListProps,
} from "./templates/series-list";
import { blogGenerationTemplate } from "./templates/generation-template";
import { blogExcerptTemplate } from "./templates/excerpt-template";
import { homepageTemplate } from "./templates/homepage";
import { BlogGenerationJobHandler } from "./handlers/blogGenerationJobHandler";
import {
  BlogDataSource,
  type BlogPostWithData,
} from "./datasources/blog-datasource";
import { generateRSSFeed } from "./rss/feed-generator";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { BlogPost } from "./schemas/blog-post";
import { blogPostFrontmatterSchema } from "./schemas/blog-post";
import { promises as fs } from "fs";
import { join } from "path";
import type { SiteBuildCompletedPayload } from "@brains/site-builder-plugin";
import packageJson from "../package.json";

/**
 * Blog Plugin
 * Provides AI-powered blog post generation from existing brain content
 */
export class BlogPlugin extends ServicePlugin<BlogConfig> {
  private pluginContext?: ServicePluginContext;

  constructor(config: BlogConfig) {
    super("blog", packageJson, config, blogConfigSchema);
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Register post entity type
    context.registerEntityType("post", blogPostSchema, blogPostAdapter);

    // Register blog datasource
    const blogDataSource = new BlogDataSource(
      context.entityService,
      this.logger.child("BlogDataSource"),
    );
    context.registerDataSource(blogDataSource);

    // Register RSS datasource
    const { RSSDataSource } = await import("./datasources/rss-datasource");
    const rssDataSource = new RSSDataSource(
      context.entityService,
      this.logger.child("RSSDataSource"),
    );
    context.registerDataSource(rssDataSource);

    // Register blog templates
    // Datasource transforms BlogPost → BlogPostWithData (adds parsed frontmatter)
    // Schema validates with optional url/typeLabel, site-builder enriches before rendering
    // Define schema for blog list template
    const postListSchema = z.object({
      posts: z.array(enrichedBlogPostSchema),
      pageTitle: z.string().optional(),
    });

    context.registerTemplates({
      "post-list": createTemplate<
        z.infer<typeof postListSchema>,
        BlogListProps
      >({
        name: "post-list",
        description: "Blog list page template",
        schema: postListSchema,
        dataSourceId: "blog:entities",
        requiredPermission: "public",
        layout: {
          component: BlogListTemplate,
          interactive: false,
        },
      }),
      "post-detail": createTemplate<
        {
          post: z.infer<typeof enrichedBlogPostSchema>;
          prevPost: z.infer<typeof enrichedBlogPostSchema> | null;
          nextPost: z.infer<typeof enrichedBlogPostSchema> | null;
          seriesPosts: z.infer<typeof enrichedBlogPostSchema>[] | null;
        },
        BlogPostProps
      >({
        name: "post-detail",
        description: "Individual blog post template",
        schema: z.object({
          post: enrichedBlogPostSchema,
          prevPost: enrichedBlogPostSchema.nullable(),
          nextPost: enrichedBlogPostSchema.nullable(),
          seriesPosts: z.array(enrichedBlogPostSchema).nullable(),
        }),
        dataSourceId: "blog:entities",
        requiredPermission: "public",
        layout: {
          component: BlogPostTemplate,
          interactive: false,
        },
      }),
      "post-series": createTemplate<
        {
          seriesName: string;
          posts: z.infer<typeof enrichedBlogPostSchema>[];
        },
        SeriesListProps
      >({
        name: "post-series",
        description: "Blog series list template",
        schema: z.object({
          seriesName: z.string(),
          posts: z.array(enrichedBlogPostSchema),
        }),
        dataSourceId: "blog:entities",
        requiredPermission: "public",
        layout: {
          component: SeriesListTemplate,
          interactive: false,
        },
      }),
      homepage: homepageTemplate,
      generation: blogGenerationTemplate,
      excerpt: blogExcerptTemplate,
    });

    // Register job handler for blog generation
    const blogGenerationHandler = new BlogGenerationJobHandler(
      this.logger.child("BlogGenerationJobHandler"),
      context,
    );
    context.registerJobHandler("generation", blogGenerationHandler);

    // Subscribe to site:build:completed to auto-generate RSS feed
    context.subscribe<SiteBuildCompletedPayload, { success: boolean }>(
      "site:build:completed",
      async (message) => {
        try {
          const payload = message.payload;

          this.logger.info(
            `Received site:build:completed event for ${payload.environment} environment`,
          );

          // Generate RSS for all builds
          // Preview: include all posts, Production: only published posts
          await this.generateRSSFeed(context, payload);
        } catch (error) {
          this.logger.error("Failed to generate RSS feed", error);
        }
        return { success: true };
      },
    );

    this.logger.info(
      "Blog plugin registered successfully (routes auto-generated at /posts/)",
    );
  }

  /**
   * Auto-generate RSS feed after site build
   */
  private async generateRSSFeed(
    context: ServicePluginContext,
    payload: SiteBuildCompletedPayload,
  ): Promise<void> {
    const isPreview = payload.environment === "preview";
    this.logger.info(
      `Auto-generating RSS feed after site build (${isPreview ? "all posts" : "published only"})`,
    );

    // Fetch all posts
    const allPosts: BlogPost[] = await context.entityService.listEntities(
      "post",
      { limit: 1000 },
    );

    // Filter posts based on environment
    // Preview: include all posts, Production: only published posts
    const filteredPosts: BlogPostWithData[] = allPosts
      .filter((p) => {
        if (isPreview) {
          // Preview: include all posts
          return true;
        } else {
          // Production: only published posts with publishedAt date
          return p.metadata.status === "published" && p.metadata.publishedAt;
        }
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
          url: payload.generateEntityUrl("post", entity.metadata.slug),
        };
      });

    if (filteredPosts.length === 0) {
      this.logger.info(
        `No ${isPreview ? "" : "published "}posts found, skipping RSS generation`,
      );
      return;
    }

    // Use site config or fallback to defaults
    const siteUrl = payload.siteConfig.url ?? "https://example.com";
    const siteTitle = payload.siteConfig.title ?? "Blog";
    const siteDescription =
      payload.siteConfig.description ?? "Latest blog posts";

    // Generate RSS XML
    const xml = generateRSSFeed(filteredPosts, {
      title: siteTitle,
      description: siteDescription,
      link: siteUrl,
      language: "en-us",
      includeAllPosts: isPreview, // Preview: all posts, Production: published only
    });

    // Write RSS feed to output directory
    const feedPath = join(payload.outputDir, "feed.xml");
    await fs.writeFile(feedPath, xml, "utf-8");

    this.logger.info(
      `RSS feed generated successfully with ${filteredPosts.length} posts at ${feedPath}`,
    );
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return [
      createGenerateTool(this.pluginContext, this.config, this.id),
      createPublishTool(this.pluginContext, this.id),
      createGenerateRSSTool(this.pluginContext),
    ];
  }

  /**
   * No resources needed for this plugin
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [];
  }
}

/**
 * Factory function to create the plugin
 */
export function blogPlugin(config: BlogConfig): Plugin {
  return new BlogPlugin(config);
}
