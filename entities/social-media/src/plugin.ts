import type {
  EntityPluginContext,
  JobHandler,
  DataSource,
  Template,
  EntityTypeConfig,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { socialPostSchema, type SocialPost } from "./schemas/social-post";
import { socialPostAdapter } from "./adapters/social-post-adapter";
import { SocialPostDataSource } from "./datasources/social-post-datasource";
import type { SocialMediaConfig, SocialMediaConfigInput } from "./config";
import { socialMediaConfigSchema } from "./config";
import { GenerationJobHandler } from "./handlers/generationHandler";
import type { PublishProvider } from "@brains/contracts";
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
import { createSocialPostAtprotoProjection } from "./atproto-projection";
import packageJson from "../package.json";

export class SocialMediaPlugin extends EntityPlugin<
  SocialPost,
  SocialMediaConfig,
  SocialMediaConfigInput
> {
  readonly entityType = socialPostAdapter.entityType;
  readonly schema = socialPostSchema;
  readonly adapter = socialPostAdapter;

  private providers = new Map<string, PublishProvider>();
  private unregisterAtprotoProjection: (() => void) | undefined;

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

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return {
      publish: { publishStatuses: ["queued", "published", "failed"] },
    };
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
    this.unregisterAtprotoProjection =
      AtprotoProjectionRegistry.getInstance().register(
        createSocialPostAtprotoProjection(),
      );

    this.logger.info("Social media plugin registered successfully");
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterAtprotoProjection?.();
    this.unregisterAtprotoProjection = undefined;
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
