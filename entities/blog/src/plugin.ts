import type {
  CreateCheckResult,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  DataSource,
  Template,
} from "@brains/plugins";
import { EntityPlugin, SYSTEM_CHANNELS } from "@brains/plugins";
import { publishAssetRegisterContract } from "@brains/contracts";
import { blogPostSchema, type BlogPost } from "./schemas/blog-post";
import { blogPostAdapter } from "./adapters/blog-post-adapter";
import type { BlogConfig, BlogConfigInput } from "./config";
import { blogConfigSchema } from "./config";
import { BlogGenerationJobHandler } from "./handlers/blogGenerationJobHandler";
import { BlogDataSource } from "./datasources/blog-datasource";
import { getTemplates } from "./lib/register-templates";
import { registerWithPublishPipeline } from "./lib/publish-handler";
import { subscribeToSiteBuildStaging } from "./lib/rss-handler";
import { registerEvalHandlers } from "./lib/eval-handlers";
import { checkPostText, createPostFromText } from "./lib/create-from-text";
import { createBlogAtprotoProjection } from "./atproto-projection";
import { createBlogPrintableProvider } from "./attachments/printable-provider";
import { BLOG_PRINTABLE_ATTACHMENT_TYPE } from "./attachments/printable-template";
import { createBlogOgImageProvider } from "./attachments/og-image-provider";
import { BLOG_OG_IMAGE_ATTACHMENT_TYPE } from "./attachments/og-image-template";
import packageJson from "../package.json";

export class BlogPlugin extends EntityPlugin<
  BlogPost,
  BlogConfig,
  BlogConfigInput
> {
  readonly entityType: typeof blogPostAdapter.entityType =
    blogPostAdapter.entityType;
  readonly schema: typeof blogPostSchema = blogPostSchema;
  readonly adapter: typeof blogPostAdapter = blogPostAdapter;
  private unregisterPrintableAttachmentProvider: (() => void) | undefined;
  private unregisterOgImageAttachmentProvider: (() => void) | undefined;

  constructor(config: BlogConfigInput = {}) {
    super("blog", packageJson, config, blogConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return {
      weight: 2.0,
      defaultSort: [{ field: "publishedAt", direction: "desc" }],
      projectionSourceRole: "primary",
      publish: { publishStatuses: ["queued", "published"] },
      // Read by nothing: not the head, the site, nor ATProto.
      retiredFields: ["ogDescription", "twitterCard", "atprotoUri"],
    };
  }

  protected override async checkCreate(
    input: CreateInput,
  ): Promise<CreateCheckResult> {
    return checkPostText(input);
  }

  protected override async interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return createPostFromText(input, executionContext, context, this.id);
  }

  protected override async getInstructions(): Promise<string> {
    return 'Saving an essay the user supplies as a post, or turning a note into a post ("turn my note X into a post": source.kind entity), is system_create: the text is kept, a leading # heading becomes the title, and the brain adds the excerpt and author. If the user says the essay was already published, pass fields { status: "published", publishedAt: "YYYY-MM-DD", canonicalUrl } with what they state.';
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

    // Publish pipeline registration and RSS subscriptions
    registerWithPublishPipeline(context, this.logger);
    subscribeToSiteBuildStaging(context, this.logger);
    registerEvalHandlers(context);
    this.unregisterPrintableAttachmentProvider = context.attachments.register(
      "post",
      BLOG_PRINTABLE_ATTACHMENT_TYPE,
      createBlogPrintableProvider(context),
    );
    this.unregisterOgImageAttachmentProvider = context.attachments.register(
      "post",
      BLOG_OG_IMAGE_ATTACHMENT_TYPE,
      createBlogOgImageProvider(context),
    );
    this.deferPublishAssetRegistration(context);
    context.atprotoProjections.register(createBlogAtprotoProjection());

    this.logger.info(
      "Blog plugin registered (routes auto-generated at /posts/)",
    );
  }

  private deferPublishAssetRegistration(context: EntityPluginContext): void {
    context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      await context.messaging.command(publishAssetRegisterContract, {
        entityType: "post",
        attachmentType: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
        mediaEntityType: "image",
        targetEntityField: { location: "frontmatter", field: "ogImageId" },
        requiredWhen: { status: "published" },
        autoGenerate: true,
      });
      return { success: true };
    });
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterPrintableAttachmentProvider?.();
    this.unregisterPrintableAttachmentProvider = undefined;
    this.unregisterOgImageAttachmentProvider?.();
    this.unregisterOgImageAttachmentProvider = undefined;
  }
}

export function blogPlugin(config: BlogConfigInput = {}): BlogPlugin {
  return new BlogPlugin(config);
}
