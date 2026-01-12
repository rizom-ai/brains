import type {
  Plugin,
  PluginTool,
  PluginResource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin, paginationInfoSchema } from "@brains/plugins";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import {
  socialPostSchema,
  enrichedSocialPostSchema,
} from "./schemas/social-post";
import { socialPostAdapter } from "./adapters/social-post-adapter";
import { SocialPostDataSource } from "./datasources/social-post-datasource";
import { createGenerateTool } from "./tools/generate";
import type { SocialMediaConfig, SocialMediaConfigInput } from "./config";
import { socialMediaConfigSchema } from "./config";
import { linkedinTemplate } from "./templates/linkedin-template";
import {
  SocialPostListTemplate,
  type SocialPostListProps,
} from "./templates/social-post-list";
import {
  SocialPostDetailTemplate,
  type SocialPostDetailProps,
} from "./templates/social-post-detail";
import { GenerationJobHandler } from "./handlers/generationHandler";
import type { PublishProvider } from "@brains/utils";
import {
  PublishExecuteHandler,
  type PublishExecutePayload,
} from "./handlers/publishExecuteHandler";
import { createLinkedInProvider } from "./lib/linkedin-client";
import packageJson from "../package.json";

/**
 * Social Media Plugin
 * Provides social media post management with platform providers
 */
export class SocialMediaPlugin extends ServicePlugin<SocialMediaConfig> {
  private pluginContext?: ServicePluginContext;
  private providers = new Map<string, PublishProvider>();

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

    // Register view templates for routes
    const postListSchema = z.object({
      posts: z.array(enrichedSocialPostSchema),
      totalCount: z.number().optional(),
      pagination: paginationInfoSchema.nullable(),
      baseUrl: z.string().optional(),
    });

    const postDetailSchema = z.object({
      post: enrichedSocialPostSchema,
    });

    context.registerTemplates({
      "social-post-list": createTemplate<
        z.infer<typeof postListSchema>,
        SocialPostListProps
      >({
        name: "social-post-list",
        description: "Social post list page template",
        schema: postListSchema,
        dataSourceId: "social-media:posts",
        requiredPermission: "public",
        layout: {
          component: SocialPostListTemplate,
          interactive: false,
        },
      }),
      "social-post-detail": createTemplate<
        z.infer<typeof postDetailSchema>,
        SocialPostDetailProps
      >({
        name: "social-post-detail",
        description: "Individual social post template",
        schema: postDetailSchema,
        dataSourceId: "social-media:posts",
        requiredPermission: "public",
        layout: {
          component: SocialPostDetailTemplate,
          interactive: false,
        },
      }),
    });

    // Initialize providers
    this.initializeProviders();

    // Register job handlers
    const generationHandler = new GenerationJobHandler(
      this.logger.child("GenerationJobHandler"),
      context,
      this.config,
    );
    context.jobs.registerHandler("generation", generationHandler);

    // Register with publish-pipeline and subscribe to execute messages
    await this.registerWithPublishPipeline(context);
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
   * Register entity type and provider with publish-pipeline
   */
  private async registerWithPublishPipeline(
    context: ServicePluginContext,
  ): Promise<void> {
    // Only register if we have providers configured
    if (this.providers.size === 0) {
      this.logger.debug(
        "No providers configured, skipping publish-pipeline registration",
      );
      return;
    }

    // Get the first provider (typically linkedin)
    const provider = this.providers.values().next().value;

    await context.sendMessage("publish:register", {
      entityType: "social-post",
      provider: provider,
    });

    this.logger.info("Registered social-post with publish-pipeline");
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

    return [createGenerateTool(this.pluginContext, this.config, this.id)];
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
