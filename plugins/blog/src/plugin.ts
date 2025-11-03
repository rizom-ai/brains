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

    // Register blog templates
    context.registerTemplates({
      "blog-list": createTemplate<BlogListProps>({
        name: "blog-list",
        description: "Blog list page template",
        schema: z.object({ posts: z.array(blogPostSchema) }),
        requiredPermission: "public",
        layout: {
          component: BlogListTemplate,
          interactive: false,
        },
      }),
      "blog-post": createTemplate<BlogPostProps>({
        name: "blog-post",
        description: "Individual blog post template",
        schema: z.object({
          post: blogPostSchema,
          prevPost: blogPostSchema.nullable(),
          nextPost: blogPostSchema.nullable(),
          seriesPosts: z.array(blogPostSchema).nullable(),
        }),
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
        requiredPermission: "public",
        layout: {
          component: SeriesListTemplate,
          interactive: false,
        },
      }),
    });

    // Register blog routes with site-builder
    await context.sendMessage("plugin:site-builder:route:register", {
      pluginId: this.id,
      routes: [
        {
          id: "blog-list",
          path: "/blog",
          title: "Blog",
          description: "Blog posts and articles",
          navigation: {
            show: true,
            label: "Blog",
            order: 20,
          },
          sections: [
            {
              id: "blog-list",
              template: "blog-list", // Will be auto-prefixed to "blog:blog-list"
              dataQuery: {
                entityType: "blog",
              },
            },
          ],
        },
        {
          id: "blog-post",
          path: "/blog/:slug",
          title: "Blog Post",
          description: "Individual blog post",
          navigation: {
            show: false,
          },
          sections: [
            {
              id: "blog-post",
              template: "blog-post", // Will be auto-prefixed to "blog:blog-post"
              dataQuery: {
                entityType: "blog",
                query: { "metadata.slug": ":slug" },
              },
            },
          ],
        },
        {
          id: "blog-series",
          path: "/blog/series/:seriesName",
          title: "Blog Series",
          description: "Blog post series",
          navigation: {
            show: false,
          },
          sections: [
            {
              id: "blog-series",
              template: "blog-series", // Will be auto-prefixed to "blog:blog-series"
              dataQuery: {
                entityType: "blog",
                query: { "metadata.seriesName": ":seriesName" },
              },
            },
          ],
        },
      ],
    });

    this.logger.info("Blog plugin registered successfully");
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
