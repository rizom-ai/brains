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
    context.entities.register(
      "social-post",
      socialPostSchema,
      socialPostAdapter,
    );

    // Register datasource
    const socialPostDataSource = new SocialPostDataSource(
      this.logger.child("SocialPostDataSource"),
    );
    context.entities.registerDataSource(socialPostDataSource);

    // Register AI templates
    context.templates.register({
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

    context.templates.register({
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

    // Subscribe to entity:updated for auto-generation when blog posts are queued
    if (this.config.autoGenerateOnBlogPublish) {
      this.subscribeToEntityUpdatedForAutoGenerate(context);
      this.subscribeToAutoGenerate(context);
      this.logger.info("Auto-generate on blog queued enabled");
    }

    // Subscribe to generate:execute for scheduled generation
    this.subscribeToGenerateExecute(context);

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

    context.eval.registerHandler("generation", async (input: unknown) => {
      const parsed = generationInputSchema.parse(input);

      const generationPrompt = parsed.content
        ? `Create an engaging LinkedIn post to share this content:\n\n${parsed.content}`
        : (parsed.prompt ?? "Write an engaging LinkedIn post");

      return context.ai.generate<{
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
    // LinkedIn provider - only init if accessToken is actually provided
    if (this.config.linkedin?.accessToken) {
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

    await context.messaging.send("publish:register", {
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
      sendMessage: context.messaging.send,
      logger: this.logger.child("PublishExecuteHandler"),
      entityService: context.entityService,
      providers: this.providers,
    });

    context.messaging.subscribe<PublishExecutePayload, { success: boolean }>(
      "publish:execute",
      async (msg) => {
        await executeHandler.handle(msg.payload);
        return { success: true };
      },
    );

    this.logger.debug("Subscribed to publish:execute messages");
  }

  /**
   * Subscribe to entity:updated to auto-generate social posts when blog posts are queued
   */
  private subscribeToEntityUpdatedForAutoGenerate(
    context: ServicePluginContext,
  ): void {
    context.messaging.subscribe<
      {
        entityType: string;
        entityId: string;
        entity: { metadata?: { status?: string } };
      },
      { success: boolean }
    >("entity:updated", async (msg) => {
      const { entityType, entityId, entity } = msg.payload;

      // Only auto-generate for blog posts
      if (entityType !== "post") {
        return { success: true };
      }

      // Only trigger when status is "queued"
      const status = entity.metadata?.status;
      if (status !== "queued") {
        return { success: true };
      }

      try {
        // Check if a social post already exists for this source
        const existingPosts = await context.entityService.listEntities(
          "social-post",
          {
            filter: {
              metadata: {
                sourceEntityType: "post",
                sourceEntityId: entityId,
              },
            },
            limit: 1,
          },
        );

        if (existingPosts.length > 0) {
          this.logger.debug(
            `Social post already exists for ${entityId}, skipping auto-generate`,
          );
          return { success: true };
        }

        // Send message to trigger auto-generation
        await context.messaging.send("social:auto-generate", {
          sourceEntityType: entityType,
          sourceEntityId: entityId,
          platform: "linkedin",
        });

        this.logger.info(
          `Auto-generate social post triggered for queued post ${entityId}`,
        );
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to trigger auto-generate for ${entityId}:`, {
          error: errorMessage,
        });
        return { success: true };
      }
    });

    this.logger.debug("Subscribed to entity:updated for auto-generation");
  }

  /**
   * Subscribe to social:auto-generate messages and enqueue generation jobs
   */
  private subscribeToAutoGenerate(context: ServicePluginContext): void {
    context.messaging.subscribe<
      {
        sourceEntityType: string;
        sourceEntityId: string;
        platform: string;
      },
      { success: boolean; jobId?: string }
    >("social:auto-generate", async (msg) => {
      const { sourceEntityType, sourceEntityId, platform } = msg.payload;

      try {
        // Enqueue generation job
        const jobId = await context.jobs.enqueue(
          "social-media:generation",
          {
            sourceEntityType,
            sourceEntityId,
            platform,
            addToQueue: false, // Default to draft status
          },
          { interfaceType: "job", userId: "system" },
        );

        this.logger.info(
          `Social post generation job enqueued for ${sourceEntityType}/${sourceEntityId}`,
          { jobId },
        );

        return { success: true, jobId };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to enqueue social post generation for ${sourceEntityId}:`,
          { error: errorMessage },
        );
        return { success: false };
      }
    });

    this.logger.debug("Subscribed to social:auto-generate messages");
  }

  /**
   * Subscribe to generate:execute messages for scheduled social post generation
   * Triggered by content-pipeline scheduler based on generation schedule
   */
  private subscribeToGenerateExecute(context: ServicePluginContext): void {
    context.messaging.subscribe<{ entityType: string }, { success: boolean }>(
      "generate:execute",
      async (msg) => {
        const { entityType } = msg.payload;

        // Only handle social-post entities
        if (entityType !== "social-post") {
          return { success: true };
        }

        this.logger.info("Received generate:execute for social-post");

        try {
          // Find a recent published blog post to generate from
          const recentPosts = await context.entityService.listEntities("post", {
            filter: { metadata: { status: "published" } },
            limit: 5,
          });

          if (recentPosts.length === 0) {
            this.logger.info(
              "No published posts found for social post generation",
            );
            await context.messaging.send("generate:report:failure", {
              entityType: "social-post",
              error: "No published posts available for social post generation",
            });
            return { success: true };
          }

          // Check which posts don't already have social posts
          let sourcePost = null;
          for (const post of recentPosts) {
            const existingPosts = await context.entityService.listEntities(
              "social-post",
              {
                filter: {
                  metadata: {
                    sourceEntityType: "post",
                    sourceEntityId: post.id,
                  },
                },
                limit: 1,
              },
            );

            if (existingPosts.length === 0) {
              sourcePost = post;
              break;
            }
          }

          if (!sourcePost) {
            this.logger.info("All recent posts already have social posts");
            await context.messaging.send("generate:report:failure", {
              entityType: "social-post",
              error: "All recent posts already have social posts generated",
            });
            return { success: true };
          }

          // Enqueue generation job
          const jobId = await context.jobs.enqueue(
            "social-media:generation",
            {
              sourceEntityType: "post",
              sourceEntityId: sourcePost.id,
              platform: "linkedin",
              addToQueue: false, // Create as draft for review
            },
            { interfaceType: "job", userId: "system" },
          );

          this.logger.info("Social post generation job queued", {
            jobId,
            sourcePostId: sourcePost.id,
          });

          // Monitor job completion to report back to content-pipeline
          this.monitorGenerationJob(context, jobId);

          return { success: true };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error("Failed to handle generate:execute:", {
            error: errorMessage,
          });
          await context.messaging.send("generate:report:failure", {
            entityType: "social-post",
            error: errorMessage,
          });
          return { success: true };
        }
      },
    );

    this.logger.debug("Subscribed to generate:execute messages");
  }

  /**
   * Monitor a generation job and report completion to content-pipeline
   */
  private monitorGenerationJob(
    context: ServicePluginContext,
    jobId: string,
  ): void {
    const unsubscribe = context.messaging.subscribe<
      {
        jobId: string;
        result: { success: boolean; entityId?: string; error?: string };
      },
      { success: boolean }
    >("job:completed", async (msg) => {
      if (msg.payload.jobId !== jobId) {
        return { success: true };
      }

      const result = msg.payload.result;

      if (result.success && result.entityId) {
        await context.messaging.send("generate:report:success", {
          entityType: "social-post",
          entityId: result.entityId,
        });
        this.logger.info("Social post generation completed", {
          entityId: result.entityId,
        });
      } else {
        await context.messaging.send("generate:report:failure", {
          entityType: "social-post",
          error: result.error ?? "Unknown error",
        });
        this.logger.error("Social post generation failed", {
          error: result.error,
        });
      }

      unsubscribe();
      return { success: true };
    });
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
