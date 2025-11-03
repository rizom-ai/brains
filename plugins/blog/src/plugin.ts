import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { blogPostSchema } from "./schemas/blog-post";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import { createGenerateTool } from "./tools/generate";
import { createPublishTool } from "./tools/publish";
import type { BlogConfig } from "./config";
import { blogConfigSchema } from "./config";
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
