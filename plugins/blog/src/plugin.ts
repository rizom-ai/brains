import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import { blogPostSchema } from "./schemas/blog-post";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import { createGenerateTool } from "./tools/generate";
import { createPublishTool } from "./tools/publish";
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
import { BlogGenerationJobHandler } from "./handlers/blogGenerationJobHandler";
import { BlogDataSource } from "./datasources/blog-datasource";
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

    // Register blog entity type
    context.registerEntityType("blog", blogPostSchema, blogPostAdapter);

    // Register blog datasource
    const blogDataSource = new BlogDataSource(
      context.entityService,
      this.logger.child("BlogDataSource"),
    );
    context.registerDataSource(blogDataSource);

    // Register blog templates
    context.registerTemplates({
      "blog-list": createTemplate<BlogListProps>({
        name: "blog-list",
        description: "Blog list page template",
        schema: z.object({ posts: z.array(blogPostSchema) }),
        dataSourceId: "blog:entities",
        requiredPermission: "public",
        layout: {
          component: BlogListTemplate,
          interactive: false,
        },
      }),
      "blog-detail": createTemplate<BlogPostProps>({
        name: "blog-detail",
        description: "Individual blog post template",
        schema: z.object({
          post: blogPostSchema,
          prevPost: blogPostSchema.nullable(),
          nextPost: blogPostSchema.nullable(),
          seriesPosts: z.array(blogPostSchema).nullable(),
        }),
        dataSourceId: "blog:entities",
        requiredPermission: "public",
        layout: {
          component: BlogPostTemplate,
          interactive: false,
        },
      }),
      "blog-series": createTemplate<SeriesListProps>({
        name: "blog-series",
        description: "Blog series list template",
        schema: z.object({
          seriesName: z.string(),
          posts: z.array(blogPostSchema),
        }),
        dataSourceId: "blog:entities",
        requiredPermission: "public",
        layout: {
          component: SeriesListTemplate,
          interactive: false,
        },
      }),
      generation: blogGenerationTemplate,
      excerpt: blogExcerptTemplate,
    });

    // Register job handler for blog generation
    const blogGenerationHandler = new BlogGenerationJobHandler(
      this.logger.child("BlogGenerationJobHandler"),
      context,
    );
    context.registerJobHandler("generation", blogGenerationHandler);

    this.logger.info(
      "Blog plugin registered successfully (routes auto-generated at /blogs/)",
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
