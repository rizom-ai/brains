import type { Plugin, PluginTool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { blogPostSchema } from "./schemas/blog-post";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import { seriesSchema } from "./schemas/series";
import { seriesAdapter } from "./adapters/series-adapter";
import { createGenerateTool } from "./tools/generate";
import { createEnhanceSeriesToolFactory } from "./tools/enhance-series";
import type { BlogConfig, BlogConfigInput } from "./config";
import { blogConfigSchema } from "./config";
import { BlogGenerationJobHandler } from "./handlers/blogGenerationJobHandler";
import { BlogDataSource } from "./datasources/blog-datasource";
import { SeriesDataSource } from "./datasources/series-datasource";
import { registerTemplates } from "./lib/register-templates";
import { subscribeToSeriesEvents } from "./lib/series-subscriptions";
import {
  registerWithPublishPipeline,
  subscribeToPublishExecute,
} from "./lib/publish-handler";
import { subscribeToSiteBuildCompleted } from "./lib/rss-handler";
import { registerEvalHandlers } from "./lib/eval-handlers";
import packageJson from "../package.json";

export class BlogPlugin extends ServicePlugin<BlogConfig> {
  private pluginContext?: ServicePluginContext;

  constructor(config: BlogConfigInput) {
    super("blog", packageJson, config, blogConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Register entity types
    context.entities.register("post", blogPostSchema, blogPostAdapter, {
      weight: 2.0,
    });
    context.entities.register("series", seriesSchema, seriesAdapter);

    // Subscribe to entity events for series auto-derivation
    subscribeToSeriesEvents(context, this.logger);

    // Register datasources
    await this.registerDataSources(context);

    // Register templates, job handlers, publish pipeline, RSS, and eval handlers
    registerTemplates(context);

    const blogGenerationHandler = new BlogGenerationJobHandler(
      this.logger.child("BlogGenerationJobHandler"),
      context,
    );
    context.jobs.registerHandler("generation", blogGenerationHandler);

    await registerWithPublishPipeline(context, this.logger);
    subscribeToPublishExecute(context, this.logger);
    subscribeToSiteBuildCompleted(context, this.logger);
    registerEvalHandlers(context);

    this.logger.info(
      "Blog plugin registered successfully (routes auto-generated at /posts/)",
    );
  }

  private async registerDataSources(
    context: ServicePluginContext,
  ): Promise<void> {
    const blogDataSource = new BlogDataSource(
      this.logger.child("BlogDataSource"),
    );
    context.entities.registerDataSource(blogDataSource);

    const seriesDataSource = new SeriesDataSource(
      this.logger.child("SeriesDataSource"),
    );
    context.entities.registerDataSource(seriesDataSource);

    const { RSSDataSource } = await import("./datasources/rss-datasource");
    const rssDataSource = new RSSDataSource(this.logger.child("RSSDataSource"));
    context.entities.registerDataSource(rssDataSource);
  }

  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return [
      createGenerateTool(this.pluginContext, this.id),
      createEnhanceSeriesToolFactory(this.pluginContext, this.id),
    ];
  }
}

export function blogPlugin(config: BlogConfigInput): Plugin {
  return new BlogPlugin(config);
}
