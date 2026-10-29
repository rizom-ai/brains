import type {
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
import { PUBLISH_ASSET_CHANNELS } from "./publish-asset-channels";
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
import { subscribeToSiteBuildStaging } from "./lib/rss-handler";
import { registerEvalHandlers } from "./lib/eval-handlers";
import { createPostFromText } from "./lib/create-from-text";
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
  private unregisterAtprotoProjection: (() => void) | undefined;
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

  protected override async interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return createPostFromText(input, executionContext, context, this.id);
  }

  protected override async getInstructions(): Promise<string> {
    return [
      "Posts from the writer's own text keep that text as written.",
      'To save an essay or draft the user supplies (pasted or uploaded) as a post, call system_create with entityType post and the text as its source (user-message for pasted text); do not use system_generate. Pass the title when the user gives one; otherwise a leading "# Title" heading becomes the title. The brain adds the excerpt, author and status; posts start as drafts.',
      'When the user says the essay was already published elsewhere, also pass fields: { status: "published", publishedAt: "<the date they give, as YYYY-MM-DD>", canonicalUrl: "<the original address>" }. Include only what they state.',
      'To turn an existing note (or other entity) into a post, such as "turn my note X into a draft post" or "make a post of my note", call system_create with entityType post and source { kind: "entity", entityType: "note", entityId }: the post keeps the note\'s text. Use system_generate prompt-from-source only when the user asks for new text written from it, such as "write a post based on my note" or "expand my note into an essay".',
    ].join(" ");
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
    registerWithPublishPipeline(context, this.logger);
    subscribeToPublishExecute(context, this.logger);
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
    this.unregisterAtprotoProjection =
      AtprotoProjectionRegistry.getInstance().register(
        createBlogAtprotoProjection(),
      );

    this.logger.info(
      "Blog plugin registered (routes auto-generated at /posts/)",
    );
  }

  private deferPublishAssetRegistration(context: EntityPluginContext): void {
    context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      await context.messaging.send({
        type: PUBLISH_ASSET_CHANNELS.register,
        payload: {
          entityType: "post",
          attachmentType: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
          mediaEntityType: "image",
          targetEntityField: { location: "frontmatter", field: "ogImageId" },
          requiredWhen: { status: "published" },
          autoGenerate: true,
          jobType: "image:image-render-source",
        },
      });
      return { success: true };
    });
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterPrintableAttachmentProvider?.();
    this.unregisterPrintableAttachmentProvider = undefined;
    this.unregisterOgImageAttachmentProvider?.();
    this.unregisterOgImageAttachmentProvider = undefined;
    this.unregisterAtprotoProjection?.();
    this.unregisterAtprotoProjection = undefined;
  }
}

export function blogPlugin(config: BlogConfigInput = {}): BlogPlugin {
  return new BlogPlugin(config);
}
