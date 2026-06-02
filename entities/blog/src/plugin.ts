import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  DataSource,
  Template,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { blogPostSchema, type BlogPost } from "./schemas/blog-post";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import type { BlogConfig, BlogConfigInput } from "./config";
import { blogConfigSchema } from "./config";
import { BlogGenerationJobHandler } from "./handlers/blogGenerationJobHandler";
import { BlogDataSource } from "./datasources/blog-datasource";
import { getTemplates } from "./lib/register-templates";
import {
  registerWithPublishPipeline,
  subscribeToPublishExecute,
} from "./lib/publish-handler";
import { subscribeToSiteBuildCompleted } from "./lib/rss-handler";
import { registerEvalHandlers } from "./lib/eval-handlers";
import { createBlogAtprotoProjection } from "./atproto-projection";
import { BlogPrintableAttachmentProvider } from "./attachments/printable-provider";
import { BLOG_PRINTABLE_ATTACHMENT_TYPE } from "./attachments/printable-template";
import packageJson from "../package.json";

export class BlogPlugin extends EntityPlugin<BlogPost, BlogConfig> {
  readonly entityType = blogPostAdapter.entityType;
  readonly schema = blogPostSchema;
  readonly adapter = blogPostAdapter;
  private unregisterAtprotoProjection: (() => void) | undefined;
  private unregisterPrintableAttachmentProvider: (() => void) | undefined;

  constructor(config: BlogConfigInput = {}) {
    super("blog", packageJson, config, blogConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return {
      weight: 2.0,
      publish: { publishStatuses: ["queued", "published"] },
    };
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return new BlogGenerationJobHandler(
      this.logger.child("BlogGenerationJobHandler"),
      context,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [new BlogDataSource(this.logger.child("BlogDataSource"))];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // RSS datasource (dynamic import)
    const { RSSDataSource } = await import("./datasources/rss-datasource");
    context.entities.registerDataSource(
      new RSSDataSource(this.logger.child("RSSDataSource")),
    );

    // Publish pipeline and RSS subscriptions
    await registerWithPublishPipeline(context, this.logger);
    subscribeToPublishExecute(context, this.logger);
    subscribeToSiteBuildCompleted(context, this.logger);
    registerEvalHandlers(context);
    this.unregisterPrintableAttachmentProvider = context.attachments.register(
      "post",
      BLOG_PRINTABLE_ATTACHMENT_TYPE,
      new BlogPrintableAttachmentProvider(context),
    );
    this.unregisterAtprotoProjection =
      AtprotoProjectionRegistry.getInstance().register(
        createBlogAtprotoProjection(),
      );

    this.logger.info(
      "Blog plugin registered (routes auto-generated at /posts/)",
    );
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterPrintableAttachmentProvider?.();
    this.unregisterPrintableAttachmentProvider = undefined;
    this.unregisterAtprotoProjection?.();
    this.unregisterAtprotoProjection = undefined;
  }
}

export function blogPlugin(config: BlogConfigInput = {}): Plugin {
  return new BlogPlugin(config);
}
