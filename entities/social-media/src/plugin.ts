import type {
  EntityPluginContext,
  JobHandler,
  DataSource,
  Template,
  BaseEntity,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { socialPostSchema, type SocialPost } from "./schemas/social-post";
import { socialPostAdapter } from "./adapters/social-post-adapter";
import { SocialPostDataSource } from "./datasources/social-post-datasource";
import type { SocialMediaConfig, SocialMediaConfigInput } from "./config";
import { socialMediaConfigSchema } from "./config";
import { GenerationJobHandler } from "./handlers/generationHandler";
import type { PublishProvider } from "@brains/utils";
import { createLinkedInProvider } from "./lib/linkedin-client";
import { getTemplates } from "./lib/register-templates";
import { registerEvalHandlers } from "./lib/eval-handlers";
import {
  registerWithPublishPipeline,
  subscribeToPublishExecute,
} from "./lib/publish-handler";
import {
  subscribeToEntityUpdatedForAutoGenerate,
  subscribeToAutoGenerate,
  subscribeToGenerateExecute,
} from "./lib/auto-generate";
import packageJson from "../package.json";

export class SocialMediaPlugin extends EntityPlugin<
  SocialPost,
  SocialMediaConfig
> {
  readonly entityType = socialPostAdapter.entityType;
  readonly schema = socialPostSchema;
  readonly adapter = socialPostAdapter;

  private providers = new Map<string, PublishProvider>();

  constructor(config: SocialMediaConfigInput) {
    super("social-media", packageJson, config, socialMediaConfigSchema);
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler {
    return new GenerationJobHandler(
      this.logger.child("GenerationJobHandler"),
      context,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [
      new SocialPostDataSource(this.logger.child("SocialPostDataSource")),
    ];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.initializeProviders();

    registerWithPublishPipeline(context, this.providers, this.logger);
    subscribeToPublishExecute(context, this.providers, this.logger);

    if (this.config.autoGenerateOnBlogPublish) {
      subscribeToEntityUpdatedForAutoGenerate(context, this.logger);
      subscribeToAutoGenerate(context, this.logger);
      this.logger.info("Auto-generate on blog publish enabled");
    }

    subscribeToGenerateExecute(context, this.logger);
    registerEvalHandlers(context);

    this.logger.info("Social media plugin registered successfully");
  }

  /**
   * Derive social post from a published source entity.
   */
  public override async derive(
    source: BaseEntity,
    _event: string,
    context: EntityPluginContext,
  ): Promise<void> {
    const metadata = source.metadata as Record<string, unknown>;
    if (metadata["status"] !== "published") return;

    // Queue social post generation for the published entity
    await context.jobs.enqueue(
      `${this.entityType}:generation`,
      {
        sourceEntityId: source.id,
        sourceEntityType: source.entityType,
      },
      null,
      {
        priority: 5,
        source: "social-media-plugin",
        metadata: {
          operationType: "content_operations" as const,
          operationTarget: `social-post:${source.entityType}:${source.id}`,
          pluginId: "social-media",
        },
      },
    );
  }

  private initializeProviders(): void {
    if (this.config.linkedin?.accessToken) {
      const linkedinProvider = createLinkedInProvider(
        this.config.linkedin,
        this.logger.child("LinkedInClient"),
      );
      this.providers.set("linkedin", linkedinProvider);
      this.logger.info("LinkedIn provider initialized");
    }
  }
}

export function socialMediaPlugin(
  config: SocialMediaConfigInput,
): SocialMediaPlugin {
  return new SocialMediaPlugin(config);
}
