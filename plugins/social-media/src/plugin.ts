import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { socialPostSchema } from "./schemas/social-post";
import { socialPostAdapter } from "./adapters/social-post-adapter";
import { SocialPostDataSource } from "./datasources/social-post-datasource";
import { createGenerateTool } from "./tools/generate";
import type { SocialMediaConfig, SocialMediaConfigInput } from "./config";
import { socialMediaConfigSchema } from "./config";
import { GenerationJobHandler } from "./handlers/generationHandler";
import type { PublishProvider } from "@brains/utils";
import { createLinkedInProvider } from "./lib/linkedin-client";
import { registerTemplates } from "./lib/register-templates";
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

export class SocialMediaPlugin extends ServicePlugin<SocialMediaConfig> {
  private pluginContext?: ServicePluginContext;
  private providers = new Map<string, PublishProvider>();

  constructor(config: SocialMediaConfigInput) {
    super("social-media", packageJson, config, socialMediaConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    context.entities.register(
      "social-post",
      socialPostSchema,
      socialPostAdapter,
    );

    const socialPostDataSource = new SocialPostDataSource(
      this.logger.child("SocialPostDataSource"),
    );
    context.entities.registerDataSource(socialPostDataSource);

    registerTemplates(context);
    this.initializeProviders();

    const generationHandler = new GenerationJobHandler(
      this.logger.child("GenerationJobHandler"),
      context,
    );
    context.jobs.registerHandler("generation", generationHandler);

    await registerWithPublishPipeline(context, this.providers, this.logger);
    subscribeToPublishExecute(context, this.providers, this.logger);

    if (this.config.autoGenerateOnBlogPublish) {
      subscribeToEntityUpdatedForAutoGenerate(context, this.logger);
      subscribeToAutoGenerate(context, this.logger);
      this.logger.info("Auto-generate on blog queued enabled");
    }

    subscribeToGenerateExecute(context, this.logger);
    registerEvalHandlers(context);

    this.logger.info("Social media plugin registered successfully");
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

  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    return [createGenerateTool(this.pluginContext, this.id)];
  }
}

export function socialMediaPlugin(
  config: SocialMediaConfigInput,
): SocialMediaPlugin {
  return new SocialMediaPlugin(config);
}
