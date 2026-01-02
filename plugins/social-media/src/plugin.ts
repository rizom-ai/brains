import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { socialPostSchema } from "./schemas/social-post";
import { socialPostAdapter } from "./adapters/social-post-adapter";
import { SocialPostDataSource } from "./datasources/social-post-datasource";
import { createGenerateTool } from "./tools/generate";
import { createQueueTool } from "./tools/queue";
import { createPublishTool } from "./tools/publish";
import { createEditTool } from "./tools/edit";
import type { SocialMediaConfig, SocialMediaConfigInput } from "./config";
import { socialMediaConfigSchema } from "./config";
import { linkedinTemplate } from "./templates/linkedin-template";
import { GenerationJobHandler } from "./handlers/generationHandler";
import { PublishJobHandler } from "./handlers/publishHandler";
import { PublishCheckerJobHandler } from "./handlers/publishCheckerHandler";
import {
  PublishExecuteHandler,
  type PublishExecutePayload,
} from "./handlers/publishExecuteHandler";
import { createLinkedInProvider } from "./lib/linkedin-client";
import type { SocialMediaProvider } from "./lib/provider";
import packageJson from "../package.json";

/**
 * Social Media Plugin
 * Provides social media post management with platform providers
 */
export class SocialMediaPlugin extends ServicePlugin<SocialMediaConfig> {
  private pluginContext?: ServicePluginContext;
  private providers = new Map<string, SocialMediaProvider>();

  constructor(config: SocialMediaConfigInput) {
    super("social-media", packageJson, config, socialMediaConfigSchema);
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    // Register social-post entity type
    context.registerEntityType(
      "social-post",
      socialPostSchema,
      socialPostAdapter,
    );

    // Register datasource
    const socialPostDataSource = new SocialPostDataSource(
      context.entityService,
      this.logger.child("SocialPostDataSource"),
    );
    context.registerDataSource(socialPostDataSource);

    // Register AI templates
    context.registerTemplates({
      linkedin: linkedinTemplate,
    });

    // Initialize providers
    this.initializeProviders();

    // Register job handlers
    const generationHandler = new GenerationJobHandler(
      this.logger.child("GenerationJobHandler"),
      context,
      this.config,
    );
    context.registerJobHandler("generation", generationHandler);

    const publishHandler = new PublishJobHandler(
      this.logger.child("PublishJobHandler"),
      context,
      this.config,
      this.providers,
    );
    context.registerJobHandler("publish", publishHandler);

    const publishCheckerHandler = new PublishCheckerJobHandler(
      this.logger.child("PublishCheckerJobHandler"),
      context,
      this.config,
      this.id,
    );
    context.registerJobHandler("publish-checker", publishCheckerHandler);

    // Auto-start publish checker if enabled
    if (this.config.enabled) {
      this.logger.info("Starting publish checker daemon");
      await context.enqueueJob(
        "publish-checker",
        {},
        null, // Background job, no tool context
        {
          source: `${this.id}:startup`,
          deduplication: "skip", // Skip if already queued
          metadata: {
            operationType: "data_processing",
            operationTarget: "publish-checker",
          },
        },
      );
    }

    // Subscribe to publish:execute messages from publish-pipeline
    this.subscribeToPublishExecute(context);

    // Register eval handlers for testing
    this.registerEvalHandlers(context);

    this.logger.info("Social media plugin registered successfully");
  }

  /**
   * Register eval handlers for plugin testing
   */
  private registerEvalHandlers(context: ServicePluginContext): void {
    // Generate LinkedIn post from prompt or content
    const generationInputSchema = z.object({
      prompt: z.string().optional(),
      content: z.string().optional(),
      platform: z.enum(["linkedin"]).default("linkedin"),
    });

    context.registerEvalHandler("generation", async (input: unknown) => {
      const parsed = generationInputSchema.parse(input);

      const generationPrompt = parsed.content
        ? `Create an engaging LinkedIn post to share this content:\n\n${parsed.content}`
        : (parsed.prompt ?? "Write an engaging LinkedIn post");

      return context.generateContent<{
        content: string;
      }>({
        prompt: generationPrompt,
        templateName: `social-media:${parsed.platform}`,
      });
    });
  }

  /**
   * Initialize platform providers based on config
   */
  private initializeProviders(): void {
    // LinkedIn provider
    if (this.config.linkedin) {
      const linkedinProvider = createLinkedInProvider(
        this.config.linkedin,
        this.logger.child("LinkedInClient"),
      );
      this.providers.set("linkedin", linkedinProvider);
      this.logger.info("LinkedIn provider initialized");
    }
  }

  /**
   * Subscribe to publish:execute messages from publish-pipeline
   */
  private subscribeToPublishExecute(context: ServicePluginContext): void {
    const executeHandler = new PublishExecuteHandler({
      sendMessage: context.sendMessage,
      logger: this.logger.child("PublishExecuteHandler"),
      entityService: context.entityService,
      providers: this.providers,
      maxRetries: this.config.maxRetries,
    });

    context.subscribe<PublishExecutePayload, { success: boolean }>(
      "publish:execute",
      async (msg) => {
        await executeHandler.handle(msg.payload);
        return { success: true };
      },
    );

    this.logger.debug("Subscribed to publish:execute messages");
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
      createQueueTool(this.pluginContext, this.id),
      createPublishTool(this.pluginContext, this.id),
      createEditTool(this.pluginContext, this.id),
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
export function socialMediaPlugin(config: SocialMediaConfigInput): Plugin {
  return new SocialMediaPlugin(config);
}
