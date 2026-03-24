import type { Plugin, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { blogPostSchema } from "./schemas/blog-post";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import type { BlogConfig, BlogConfigInput } from "./config";
import { blogConfigSchema } from "./config";
import { BlogGenerationJobHandler } from "./handlers/blogGenerationJobHandler";
import { BlogDataSource } from "./datasources/blog-datasource";
import { registerTemplates } from "./lib/register-templates";
import {
  registerWithPublishPipeline,
  subscribeToPublishExecute,
} from "./lib/publish-handler";
import { subscribeToSiteBuildCompleted } from "./lib/rss-handler";
import { registerEvalHandlers } from "./lib/eval-handlers";
import packageJson from "../package.json";

export class BlogPlugin extends ServicePlugin<BlogConfig> {
  constructor(config: BlogConfigInput) {
    super("blog", packageJson, config, blogConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register entity type
    context.entities.register(
      blogPostAdapter.entityType,
      blogPostSchema,
      blogPostAdapter,
      { weight: 2.0 },
    );

    // Register datasources
    const blogDataSource = new BlogDataSource(
      this.logger.child("BlogDataSource"),
    );
    context.entities.registerDataSource(blogDataSource);

    const { RSSDataSource } = await import("./datasources/rss-datasource");
    const rssDataSource = new RSSDataSource(this.logger.child("RSSDataSource"));
    context.entities.registerDataSource(rssDataSource);

    // Register templates and generation handler
    registerTemplates(context);

    context.jobs.registerHandler(
      `${blogPostAdapter.entityType}:generation`,
      new BlogGenerationJobHandler(
        this.logger.child("BlogGenerationJobHandler"),
        context,
      ),
    );

    // Publish pipeline and RSS
    await registerWithPublishPipeline(context, this.logger);
    subscribeToPublishExecute(context, this.logger);
    subscribeToSiteBuildCompleted(context, this.logger);
    registerEvalHandlers(context);

    this.logger.info(
      "Blog plugin registered (routes auto-generated at /posts/)",
    );
  }
}

export function blogPlugin(config: BlogConfigInput): Plugin {
  return new BlogPlugin(config);
}
