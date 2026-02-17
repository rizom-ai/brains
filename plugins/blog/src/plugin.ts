import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin, paginationInfoSchema } from "@brains/plugins";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import { blogPostSchema, enrichedBlogPostSchema } from "./schemas/blog-post";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import { seriesSchema, seriesListItemSchema } from "./schemas/series";
import { seriesAdapter } from "./adapters/series-adapter";
import { SeriesManager } from "./services/series-manager";
import { createGenerateTool } from "./tools/generate";
import { createEnhanceSeriesToolFactory } from "./tools/enhance-series";
import type { BlogConfig, BlogConfigInput } from "./config";
import { blogConfigSchema } from "./config";
import { BlogListTemplate, type BlogListProps } from "./templates/blog-list";
import { BlogPostTemplate, type BlogPostProps } from "./templates/blog-post";
import {
  SeriesDetailTemplate,
  type SeriesDetailProps,
} from "./templates/series-detail";
import {
  SeriesListTemplate,
  type SeriesListProps,
} from "./templates/series-list";
import { blogGenerationTemplate } from "./templates/generation-template";
import { blogExcerptTemplate } from "./templates/excerpt-template";
import { seriesDescriptionTemplate } from "./templates/series-description-template";
import { homepageTemplate } from "./templates/homepage";
import { BlogGenerationJobHandler } from "./handlers/blogGenerationJobHandler";
import {
  BlogDataSource,
  type BlogPostWithData,
} from "./datasources/blog-datasource";
import { SeriesDataSource } from "./datasources/series-datasource";
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

  constructor(config: BlogConfigInput) {
    super("blog", packageJson, config, blogConfigSchema);
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Register post entity type with high weight for search prioritization
    context.entities.register("post", blogPostSchema, blogPostAdapter, {
      weight: 2.0,
    });

    // Register series entity type (auto-derived from posts)
    context.entities.register("series", seriesSchema, seriesAdapter);

    // Create series manager for auto-deriving series from posts
    const seriesManager = new SeriesManager(
      context.entityService,
      this.logger.child("SeriesManager"),
    );

    // Subscribe to post changes to sync series
    context.messaging.subscribe<
      { entityType: string; entity: BlogPost },
      { success: boolean }
    >("entity:created", async (message) => {
      if (message.payload.entityType === "post") {
        await seriesManager.handlePostChange(message.payload.entity);
      }
      return { success: true };
    });

    context.messaging.subscribe<
      { entityType: string; entity: BlogPost },
      { success: boolean }
    >("entity:updated", async (message) => {
      if (message.payload.entityType === "post") {
        await seriesManager.handlePostChange(message.payload.entity);
      }
      return { success: true };
    });

    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("entity:deleted", async (message) => {
      if (message.payload.entityType === "post") {
        // Full sync since we don't have the deleted post's data
        await seriesManager.syncSeriesFromPosts();
      }
      return { success: true };
    });

    // Initial sync of series from existing posts
    context.messaging.subscribe("sync:initial:completed", async () => {
      this.logger.info("Initial sync completed, syncing series from posts");
      await seriesManager.syncSeriesFromPosts();
      return { success: true };
    });

    // Register blog datasource
    // Note: inline image resolution is handled by site-builder, not datasource
    const blogDataSource = new BlogDataSource(
      this.logger.child("BlogDataSource"),
    );
    context.entities.registerDataSource(blogDataSource);

    // Register series datasource
    const seriesDataSource = new SeriesDataSource(
      this.logger.child("SeriesDataSource"),
    );
    context.entities.registerDataSource(seriesDataSource);

    // Register RSS datasource
    const { RSSDataSource } = await import("./datasources/rss-datasource");
    const rssDataSource = new RSSDataSource(this.logger.child("RSSDataSource"));
    context.entities.registerDataSource(rssDataSource);

    // Register blog templates
    // Datasource transforms BlogPost → BlogPostWithData (adds parsed frontmatter)
    // Schema validates with optional url/typeLabel, site-builder enriches before rendering
    // Define schema for blog list template (with pagination support)
    const postListSchema = z.object({
      posts: z.array(enrichedBlogPostSchema),
      pageTitle: z.string().optional(),
      pagination: paginationInfoSchema.nullable(),
      baseUrl: z.string().optional(),
    });

    // Define schema for series detail template
    const seriesDetailSchema = z.object({
      seriesName: z.string(),
      posts: z.array(enrichedBlogPostSchema),
      series: seriesListItemSchema,
      description: z.string().optional(),
    });

    context.templates.register({
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
      "series-list": createTemplate<
        {
          series: z.infer<typeof seriesListItemSchema>[];
        },
        SeriesListProps
      >({
        name: "series-list",
        description: "List of all series",
        schema: z.object({
          series: z.array(seriesListItemSchema),
        }),
        dataSourceId: "blog:series",
        requiredPermission: "public",
        layout: {
          component: SeriesListTemplate,
          interactive: false,
        },
      }),
      "series-detail": createTemplate<
        z.infer<typeof seriesDetailSchema>,
        SeriesDetailProps
      >({
        name: "series-detail",
        description: "Posts in a specific series",
        schema: seriesDetailSchema,
        dataSourceId: "blog:series",
        requiredPermission: "public",
        layout: {
          component: SeriesDetailTemplate,
          interactive: false,
        },
      }),
      homepage: homepageTemplate,
      generation: blogGenerationTemplate,
      excerpt: blogExcerptTemplate,
      "series-description": seriesDescriptionTemplate,
    });

    // Register job handler for blog generation
    const blogGenerationHandler = new BlogGenerationJobHandler(
      this.logger.child("BlogGenerationJobHandler"),
      context,
    );
    context.jobs.registerHandler("generation", blogGenerationHandler);

    // Register with publish-pipeline
    await this.registerWithPublishPipeline(context);
    this.subscribeToPublishExecute(context);

    // Subscribe to site:build:completed to auto-generate RSS feed
    context.messaging.subscribe<
      SiteBuildCompletedPayload,
      { success: boolean }
    >("site:build:completed", async (message) => {
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
    });

    // Register eval handlers for AI testing
    this.registerEvalHandlers(context);

    this.logger.info(
      "Blog plugin registered successfully (routes auto-generated at /posts/)",
    );
  }

  /**
   * Register eval handlers for plugin testing
   */
  private registerEvalHandlers(context: ServicePluginContext): void {
    // Generate full blog post (title, content, excerpt) from prompt
    const generatePostInputSchema = z.object({
      prompt: z.string(),
      seriesName: z.string().optional(),
    });

    context.eval.registerHandler("generatePost", async (input: unknown) => {
      const parsed = generatePostInputSchema.parse(input);
      const generationPrompt = `${parsed.prompt}${parsed.seriesName ? `\n\nNote: This is part of a series called "${parsed.seriesName}".` : ""}`;

      return context.ai.generate<{
        title: string;
        content: string;
        excerpt: string;
      }>({
        prompt: generationPrompt,
        templateName: "blog:generation",
      });
    });

    // Generate excerpt from title + content
    const generateExcerptInputSchema = z.object({
      title: z.string(),
      content: z.string(),
    });

    context.eval.registerHandler("generateExcerpt", async (input: unknown) => {
      const parsed = generateExcerptInputSchema.parse(input);

      return context.ai.generate<{
        excerpt: string;
      }>({
        prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
        templateName: "blog:excerpt",
      });
    });
  }

  /**
   * Register with publish-pipeline using internal provider
   */
  private async registerWithPublishPipeline(
    context: ServicePluginContext,
  ): Promise<void> {
    // Internal provider for blog posts (no external API)
    const internalProvider = {
      name: "internal",
      publish: async (): Promise<{ id: string }> => {
        return { id: "internal" };
      },
    };

    await context.messaging.send("publish:register", {
      entityType: "post",
      provider: internalProvider,
    });

    this.logger.info("Registered post with publish-pipeline");
  }

  /**
   * Subscribe to publish:execute messages from publish-pipeline
   */
  private subscribeToPublishExecute(context: ServicePluginContext): void {
    context.messaging.subscribe<
      { entityType: string; entityId: string },
      { success: boolean }
    >("publish:execute", async (msg) => {
      const { entityType, entityId } = msg.payload;

      // Only handle post entities
      if (entityType !== "post") {
        return { success: true };
      }

      try {
        // Get the post
        const post = await context.entityService.getEntity<BlogPost>(
          "post",
          entityId,
        );

        if (!post) {
          await context.messaging.send("publish:report:failure", {
            entityType,
            entityId,
            error: `Post not found: ${entityId}`,
          });
          return { success: true };
        }

        // Skip already published posts
        if (post.metadata.status === "published") {
          this.logger.debug(`Post already published: ${entityId}`);
          return { success: true };
        }

        // Parse frontmatter and publish
        const parsed = parseMarkdownWithFrontmatter(
          post.content,
          blogPostFrontmatterSchema,
        );

        const publishedAt = new Date().toISOString();
        const updatedFrontmatter = {
          ...parsed.metadata,
          status: "published" as const,
          publishedAt,
        };

        const updatedContent = blogPostAdapter.createPostContent(
          updatedFrontmatter,
          parsed.content,
        );

        await context.entityService.updateEntity({
          ...post,
          content: updatedContent,
          metadata: {
            ...post.metadata,
            status: "published",
            publishedAt,
          },
        });

        await context.messaging.send("publish:report:success", {
          entityType,
          entityId,
          result: { id: entityId },
        });

        this.logger.info(`Published post: ${entityId}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await context.messaging.send("publish:report:failure", {
          entityType,
          entityId,
          error: errorMessage,
        });
        this.logger.error(`Failed to publish post: ${errorMessage}`);
      }

      return { success: true };
    });

    this.logger.debug("Subscribed to publish:execute messages");
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

    // Note: RSS generation is automatic via site:build:completed event
    // Publish tool removed - use publish-pipeline_publish instead
    return [
      createGenerateTool(this.pluginContext, this.config, this.id),
      createEnhanceSeriesToolFactory(this.pluginContext, this.id),
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
export function blogPlugin(config: BlogConfigInput): Plugin {
  return new BlogPlugin(config);
}
